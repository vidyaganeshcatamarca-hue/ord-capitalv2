// ============================================================================
// 109 - Aplica la 108 y la prueba de punta a punta, dentro de transacciones
//       que se REVIERTEN.
//
//   Orden: primero corre la simulacion contra la version ACTUAL (debe fallar:
//   RED), despues aplica la 108 y la vuelve a correr (debe pasar: GREEN).
//
//   Oráculo: fn_reporte_vencimientos_tarjetas(), que es lo que el usuario ve en
//   pantalla. La invariante es "el pago consume exactamente el resumen anterior
//   que el reporte anuncia", no una reimplementacion de la formula.
//
//   Tarjeta 825 del sandbox: en el user 20 arrastra las 34 cuotas de MC BNA (por
//   el bug de mapeo del clon, ver 110). Aca se le fuerza el ciclo real de MC BNA
//   (cierre 24 / vencimiento 4) dentro de la transaccion, que se revierte.
//
//   Nada se persiste: la aplicacion va con COMMIT (DDL), todo lo demas con
//   ROLLBACK.
// ============================================================================
import fs from 'node:fs'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) =>
  await (
    await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
  ).json()

const TARJETA = 825
const BILLETERA = 1389
const USER = 20

const PRELUDIO = `
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT auth_id::text FROM public.usuarios WHERE user_id = ${USER}),
                    'role', 'authenticated')::text, true);
UPDATE public.p_tarjetas_credito SET dia_cierre = 24, dia_vencimiento = 4 WHERE tarjeta_id = ${TARJETA};
`

// ---------------------------------------------------------------------------
// Casos 1..3: pagando el resumen anterior en tres fechas distintas, el pago
// tiene que consumir SIEMPRE el mismo resumen (el que anuncia el reporte).
// Cada fecha va en su propia transaccion: si compartieran una, el pago del
// primer caso ya dejaria octubre saldado y los siguientes no probarian nada.
// ---------------------------------------------------------------------------
const simFecha = (offset) => `
BEGIN;
${PRELUDIO}
DO $sim$
DECLARE
    v_f date := CURRENT_DATE + ${offset};
    v_antes bigint[];
    v_consumidas bigint[];
    v_consumido numeric;
    v_rep_anterior numeric;
    v_prox_venc date;
    v_pagado numeric;
    v_caja bigint;
    v_fantasma int;
BEGIN
        SELECT array_agg(cuota_id ORDER BY cuota_id) INTO v_antes
          FROM public.p_cuotas_detalle WHERE tarjeta_id = ${TARJETA} AND pagado = false;

        -- Oráculo: lo que el reporte anuncia como resumen anterior, hoy.
        SELECT COALESCE(resumen_anterior_total_ars, 0) INTO v_rep_anterior
          FROM public.fn_reporte_vencimientos_tarjetas() WHERE tarjeta_id = ${TARJETA};

        IF COALESCE(v_rep_anterior, 0) <= 0.01 THEN
            RAISE EXCEPTION 'A0 fecha_pago=%: el reporte no anuncia resumen anterior (nada que probar)', v_f;
        END IF;

        v_pagado := v_rep_anterior;
        v_caja := public.fn_registrar_pago_tarjeta_multi(
            p_tarjeta_id => ${TARJETA},
            p_fecha_pago => v_f,
            p_pagos      => jsonb_build_array(jsonb_build_object('billetera_id', ${BILLETERA}, 'monto', v_pagado)),
            p_objetivo   => 'anterior');

        SELECT array_agg(cuota_id ORDER BY cuota_id), COALESCE(SUM(monto_cuota), 0)
          INTO v_consumidas, v_consumido
          FROM public.p_cuotas_detalle
         WHERE tarjeta_id = ${TARJETA} AND pagado = true AND cuota_id = ANY (v_antes);

        -- A1: consumio exactamente el resumen anterior que muestra el reporte.
        IF ABS(COALESCE(v_consumido, 0) - v_rep_anterior) > 0.01 THEN
            RAISE EXCEPTION 'A1 fecha_pago=%: consumio % pero el reporte anuncia % como resumen anterior',
                v_f, COALESCE(v_consumido, 0), v_rep_anterior;
        END IF;

        -- A2: ninguna cuota del ciclo siguiente (o posterior) puede quedar pagada.
        IF EXTRACT(DAY FROM CURRENT_DATE) <= 4 THEN
            v_prox_venc := date_trunc('month', CURRENT_DATE) + INTERVAL '3 days';
        ELSE
            v_prox_venc := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month') + INTERVAL '3 days';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.p_cuotas_detalle
             WHERE tarjeta_id = ${TARJETA} AND cuota_id = ANY (COALESCE(v_consumidas, '{}'))
               AND fecha_estimada_pago >= date_trunc('month', v_prox_venc)::date
        ) THEN
            RAISE EXCEPTION 'A2 fecha_pago=%: se llevo puesto el ciclo siguiente (>= %)', v_f,
                date_trunc('month', v_prox_venc)::date;
        END IF;

        -- A3: sin cuota sintetica (refinanciacion) en modo objetivo.
        SELECT count(*) INTO v_fantasma
          FROM public.p_cuotas_detalle
         WHERE tarjeta_id = ${TARJETA} AND cuota_id <> ALL (COALESCE(v_antes, '{}'));
        IF v_fantasma > 0 THEN
            RAISE EXCEPTION 'A3 fecha_pago=%: creo % cuota(s) sintetica(s) al refinanciar', v_f, v_fantasma;
        END IF;
    RAISE NOTICE 'A1-A3 ok con fecha de pago %', v_f;
END $sim$;
ROLLBACK;
`

// ---------------------------------------------------------------------------
// Caso 4: pago parcial. No puede marcar pagado mas de lo que la plata cubre,
// ni dejar cuotas pagadas sin pago, ni inventar una cuota al ciclo siguiente.
// ---------------------------------------------------------------------------
const SIM_PARCIAL = `
BEGIN;
${PRELUDIO}
DO $parcial$
DECLARE
    v_antes bigint[];
    v_consumidas bigint[];
    v_consumido numeric;
    v_restantes numeric;
    v_monto numeric := 200000;
    v_fantasma int;
BEGIN
    SELECT array_agg(cuota_id ORDER BY cuota_id) INTO v_antes
      FROM public.p_cuotas_detalle WHERE tarjeta_id = ${TARJETA} AND pagado = false;

    PERFORM public.fn_registrar_pago_tarjeta_multi(
        p_tarjeta_id => ${TARJETA},
        p_fecha_pago => CURRENT_DATE,
        p_pagos      => jsonb_build_array(jsonb_build_object('billetera_id', ${BILLETERA}, 'monto', v_monto)),
        p_objetivo   => 'anterior');

    SELECT array_agg(cuota_id ORDER BY cuota_id), COALESCE(SUM(monto_cuota), 0)
      INTO v_consumidas, v_consumido
      FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND pagado = true AND cuota_id = ANY (v_antes);

    -- A4: no se puede marcar pagado mas de lo que entro.
    IF COALESCE(v_consumido, 0) > v_monto + 0.01 THEN
        RAISE EXCEPTION 'A4 pago parcial de %: marco pagado %', v_monto, COALESCE(v_consumido, 0);
    END IF;

    -- A5: el remanente del resumen tiene que seguir impago (nada de "todas pagadas").
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_restantes
      FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND pagado = false AND cuota_id = ANY (COALESCE(v_antes, '{}'));
    IF v_restantes <= 0.01 THEN
        RAISE EXCEPTION 'A5 pago parcial de %: dejo el resumen entero como pagado (restante=%)',
            v_monto, v_restantes;
    END IF;

    -- A6: sin cuota sintetica.
    SELECT count(*) INTO v_fantasma
      FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND cuota_id <> ALL (COALESCE(v_antes, '{}'));
    IF v_fantasma > 0 THEN
        RAISE EXCEPTION 'A6 pago parcial: creo % cuota(s) sintetica(s)', v_fantasma;
    END IF;

    RAISE NOTICE 'A4-A6 ok: pago parcial marca solo lo que cubre y deja el resto impago';
END $parcial$;
ROLLBACK;
`

// ---------------------------------------------------------------------------
// Caso 5 (regresion): el modo legacy (p_objetivo NULL) NO cambia. Sigue
// liquidando toda la ventana del ciclo y refinanciando el faltante.
// ---------------------------------------------------------------------------
const SIM_LEGACY = `
BEGIN;
${PRELUDIO}
DO $legacy$
DECLARE
    v_antes bigint[];
    v_consumido numeric;
    v_fantasma int;
BEGIN
    SELECT array_agg(cuota_id ORDER BY cuota_id) INTO v_antes
      FROM public.p_cuotas_detalle WHERE tarjeta_id = ${TARJETA} AND pagado = false;

    PERFORM public.fn_registrar_pago_tarjeta_multi(
        p_tarjeta_id => ${TARJETA},
        p_fecha_pago => CURRENT_DATE,
        p_pagos      => jsonb_build_array(jsonb_build_object('billetera_id', ${BILLETERA}, 'monto', 440666.67)),
        p_objetivo   => NULL);

    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_consumido
      FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND pagado = true AND cuota_id = ANY (v_antes);

    SELECT count(*) INTO v_fantasma
      FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND cuota_id <> ALL (COALESCE(v_antes, '{}'));

    IF COALESCE(v_consumido, 0) <= 440666.67 + 0.01 THEN
        RAISE EXCEPTION 'A7 legacy: liquido solo % (esperaba mas de 440.666,67: comportamiento previo)', v_consumido;
    END IF;
    IF v_fantasma <> 1 THEN
        RAISE EXCEPTION 'A7 legacy: esperaba 1 cuota refinanciada, encontre %', v_fantasma;
    END IF;
    RAISE NOTICE 'A7 ok: el modo legacy conserva el comportamiento anterior (% liquidado, % refi)',
        v_consumido, v_fantasma;
END $legacy$;
ROLLBACK;
`

const SUITE = [
  ['A1-A3 fecha de pago = hoy', simFecha(0)],
  ['A1-A3 fecha de pago = hoy + 8d (cruce de ciclo)', simFecha(8)],
  ['A1-A3 fecha de pago = hoy + 20d', simFecha(20)],
  ['A4-A6 pago parcial', SIM_PARCIAL],
  ['A7 regresion legacy', SIM_LEGACY],
]

const correr = async (titulo) => {
  console.log(`\n── ${titulo}`)
  let fallos = 0
  for (const [nombre, sql] of SUITE) {
    const r = await q(sql)
    if (r?.message) {
      console.log(`   ✗ ${nombre}: ${r.message.split('\n')[0]}`)
      fallos++
    } else {
      console.log(`   ✓ ${nombre}`)
    }
  }
  return fallos
}

// ---------------------------------------------------------------- 1) RED
const rojos = await correr('RED · simulacion contra la version desplegada (antes de aplicar 108)')
if (rojos === 0) {
  console.log('\n⚠ La simulacion NO reproduce el bug en la version actual: no aplico nada.')
  process.exit(1)
}
console.log(`\nRED confirmado: ${rojos} caso(s) fallan antes del fix.`)

// ---------------------------------------------------------------- 2) aplicar
const sql108 = fs.readFileSync('temp_sql/108_pago_resumen_anterior_ventana.sql', 'utf8')
const aplic = await q('BEGIN;\n' + sql108 + '\nCOMMIT;')
if (aplic?.message) {
  console.log('✗ 108 no se pudo aplicar: ' + aplic.message)
  process.exit(1)
}
console.log('✓ 108 aplicada')

// ---------------------------------------------------------------- 3) GREEN
const verdes = await correr('GREEN · misma simulacion despues del fix')
if (verdes > 0) {
  console.log(`\n✗ QUEDAN ${verdes} caso(s) fallando`)
  process.exit(1)
}
console.log('\n✓ ALL TESTS PASSED (todo dentro de transacciones revertidas, cero datos persistidos)')

// ---------------------------------------------------------------- 4) control
const marca = await q(`
  select (pg_get_functiondef('public.fn_registrar_pago_tarjeta_multi'::regproc) like '%EXTRACT(DAY FROM CURRENT_DATE) <= v_dia_vencimiento%') as ventana_anclada,
         (pg_get_functiondef('public.fn_liquidar_ciclo_tarjeta_multi'::regproc) like '%v_pool_ars + v_saldo_favor_ars%') as tope_pool`)
console.log('CONTROL:', JSON.stringify(marca?.[0] ?? marca))
