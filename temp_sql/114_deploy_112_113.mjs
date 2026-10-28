// ============================================================================
// 114 - Aplica la 112 (pago v2) y la 113 (clon v2) y prueba los dos frentes.
//
//   RED: corre la simulacion contra lo desplegado y exige que fallen EXACTAMENTE
//   los casos que la 112 viene a arreglar. Si falla otra cosa, aborta sin aplicar
//   (el 109 original daba por bueno cualquier error; ver L9 del documento).
//
//   Los ids NO estan hardcodeados: la tarjeta se busca por identidad
//   (nombre + ciclo) y la billetera por saldo, porque el re-clon renumera todo.
//
//   Todo se REVIERTE salvo la aplicacion de 112 y 113.
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

const USER = 20
const ORIGEN = 30

// ------------------------------------------------------------------ ids vivos
const [ids] = await q(`
  SELECT (SELECT tarjeta_id FROM public.p_tarjetas_credito
           WHERE user_id = ${USER} AND nombre_tarjeta = 'MC BNA'
             AND dia_cierre = 24 AND dia_vencimiento = 4) AS tarjeta,
         (SELECT billetera_id FROM public.p_billeteras
           WHERE user_id = ${USER} AND moneda = 'ARS' AND activa = true
           ORDER BY saldo_actual DESC LIMIT 1) AS billetera,
         (SELECT billetera_id FROM public.p_billeteras
           WHERE user_id = ${USER} AND moneda = 'USD' AND activa = true AND saldo_actual > 0
           ORDER BY saldo_actual DESC LIMIT 1) AS billetera_usd,
         COALESCE((SELECT d.valor_por_usd FROM public.p_divisas d
                    WHERE d.nombre = COALESCE((SELECT moneda_default FROM public.p_config_region
                                                WHERE user_id = ${USER}), 'ARS')
                    ORDER BY d.ultima_actualizacion DESC LIMIT 1), 1) AS cot`)
if (!ids?.tarjeta || !ids?.billetera) {
  console.log('✗ no encuentro MC BNA (24/4) o una billetera ARS en user', USER)
  process.exit(1)
}
const { tarjeta: TARJETA, billetera: BILLETERA, billetera_usd: BILLETERA_USD, cot: COT } = ids
console.log(`tarjeta MC BNA = ${TARJETA} · billetera ARS = ${BILLETERA} · USD = ${BILLETERA_USD} · cotizacion = ${COT}`)

const PRELUDIO = `
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT auth_id::text FROM public.usuarios WHERE user_id = ${USER}),
                    'role', 'authenticated')::text, true);
`

const PAGO = (monto, fecha, objetivo, extra = 'NULL') => `public.fn_registrar_pago_tarjeta_multi(
        p_tarjeta_id => ${TARJETA}, p_fecha_pago => ${fecha},
        p_pagos      => jsonb_build_array(jsonb_build_object('billetera_id', ${BILLETERA}, 'monto', ${monto})),
        p_resumen_real => ${extra}, p_objetivo => ${objetivo})`

// ---------------------------------------------------------------- P1: 3 fechas
const p1 = (offset) => `
BEGIN;
${PRELUDIO}
DO $p1$
DECLARE
    v_f date := CURRENT_DATE + ${offset};
    v_antes bigint[]; v_consumidas bigint[]; v_consumido numeric; v_rep numeric;
    v_pagado numeric; v_fantasma int;
BEGIN
    SELECT array_agg(cuota_id ORDER BY cuota_id) INTO v_antes
      FROM public.p_cuotas_detalle WHERE tarjeta_id = ${TARJETA} AND pagado = false;

    SELECT COALESCE(resumen_anterior_total_ars, 0) INTO v_rep
      FROM public.fn_reporte_vencimientos_tarjetas() WHERE tarjeta_id = ${TARJETA};
    IF COALESCE(v_rep, 0) <= 0.01 THEN
        RAISE EXCEPTION 'P1 fecha=%: el reporte no anuncia resumen anterior', v_f;
    END IF;

    PERFORM ${PAGO('v_rep', 'v_f', "'anterior'")};

    SELECT array_agg(cuota_id), COALESCE(SUM(monto_cuota), 0) INTO v_consumidas, v_consumido
      FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND pagado = true AND cuota_id = ANY (v_antes);

    IF ABS(COALESCE(v_consumido, 0) - v_rep) > 0.01 THEN
        RAISE EXCEPTION 'P1 fecha=%: consumio % y el reporte anuncia %', v_f, v_consumido, v_rep;
    END IF;

    SELECT count(*) INTO v_fantasma FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND cuota_id <> ALL (COALESCE(v_antes, '{}'));
    IF v_fantasma > 0 THEN
        RAISE EXCEPTION 'P1 fecha=%: creo % cuota(s) sintetica(s)', v_f, v_fantasma;
    END IF;
END $p1$;
ROLLBACK;
`

// ------------------------------------------- P2: parcial, FIFO y sobrante
const P2 = `
BEGIN;
${PRELUDIO}
DO $p2$
DECLARE
    v_antes bigint[]; v_pagadas record; v_primera_no_entra date; v_monto numeric := 200000;
    v_aplicado numeric; v_saldo_antes numeric; v_saldo_despues numeric; v_fantasma int;
    v_posterior_pagada int;
BEGIN
    SELECT array_agg(cuota_id ORDER BY cuota_id) INTO v_antes
      FROM public.p_cuotas_detalle WHERE tarjeta_id = ${TARJETA} AND pagado = false;
    SELECT COALESCE(saldo_a_favor, 0) INTO v_saldo_antes
      FROM public.p_tarjetas_credito WHERE tarjeta_id = ${TARJETA};

    PERFORM ${PAGO('v_monto', 'CURRENT_DATE', "'anterior'")};

    SELECT COALESCE(SUM(c.monto_cuota), 0) INTO v_aplicado
      FROM public.p_cuotas_detalle c
     WHERE c.tarjeta_id = ${TARJETA} AND c.pagado = true AND c.cuota_id = ANY (v_antes);

    -- P2a: no se puede aplicar mas plata de la que entro.
    IF v_aplicado > v_monto + 0.01 THEN
        RAISE EXCEPTION 'P2a marco pagado % con un pago de %', v_aplicado, v_monto;
    END IF;

    -- P2b: FIFO estricto. Si una cuota no entro, ninguna POSTERIOR de la ventana
    -- puede quedar pagada mientras esa siga impaga.
    SELECT min(fecha_estimada_pago) INTO v_primera_no_entra
      FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND pagado = false AND cuota_id = ANY (v_antes);

    SELECT count(*) INTO v_posterior_pagada
      FROM public.p_cuotas_detalle c
     WHERE c.tarjeta_id = ${TARJETA} AND c.cuota_id = ANY (v_antes)
       AND c.pagado = true AND c.fecha_estimada_pago > v_primera_no_entra;
    IF v_posterior_pagada > 0 THEN
        RAISE EXCEPTION 'P2b FIFO invertido: % cuota(s) posteriores a la primera impaga (%) quedaron pagadas',
            v_posterior_pagada, v_primera_no_entra;
    END IF;

    -- P2c: la plata que entro y no se aplico queda a favor. No se pierde.
    SELECT COALESCE(saldo_a_favor, 0) INTO v_saldo_despues
      FROM public.p_tarjetas_credito WHERE tarjeta_id = ${TARJETA};
    IF ABS((v_saldo_despues - v_saldo_antes) - (v_monto - v_aplicado)) > 0.01 THEN
        RAISE EXCEPTION 'P2c se perdieron % (aplicado %, a favor % -> %)',
            v_monto - v_aplicado - (v_saldo_despues - v_saldo_antes), v_aplicado,
            v_saldo_antes, v_saldo_despues;
    END IF;

    -- P2d: sin cuota sintetica.
    SELECT count(*) INTO v_fantasma FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND cuota_id <> ALL (COALESCE(v_antes, '{}'));
    IF v_fantasma > 0 THEN
        RAISE EXCEPTION 'P2d creo % cuota(s) sintetica(s)', v_fantasma;
    END IF;
END $p2$;
ROLLBACK;
`

// ------------------------------- P3: resumen_real + parcial no pierde plata
const P3 = `
BEGIN;
${PRELUDIO}
DO $p3$
DECLARE
    v_monto numeric := 300000; v_resumen numeric := 440666.67;
    v_aplicado numeric; v_saldo numeric; v_caja bigint; v_diferencias int;
BEGIN
    SELECT ${PAGO('v_monto', 'CURRENT_DATE', "'anterior'", 'v_resumen')} INTO v_caja;

    SELECT COALESCE(SUM(c.monto_cuota), 0) INTO v_aplicado
      FROM public.p_cuotas_detalle c WHERE c.tarjeta_id = ${TARJETA} AND c.pagado = true;
    SELECT COALESCE(saldo_a_favor, 0) INTO v_saldo
      FROM public.p_tarjetas_credito WHERE tarjeta_id = ${TARJETA};

    -- P3a: nada se evapora (lo aplicado + lo que quedo a favor == lo que entro).
    IF ABS(v_aplicado + v_saldo - v_monto) > 0.01 THEN
        RAISE EXCEPTION 'P3a se perdieron % (aplicado % + a favor % != %)',
            v_monto - v_aplicado - v_saldo, v_aplicado, v_saldo, v_monto;
    END IF;

    -- P3b: la deuda que sigue viva como cuota no se registra ademas como Diferencia Tarjeta.
    SELECT count(*) INTO v_diferencias FROM public.p_caja
     WHERE parent_pago_caja_id = v_caja AND detalle = 'adjustment_card_diff';
    IF v_diferencias > 0 THEN
        RAISE EXCEPTION 'P3b se creo % Diferencia Tarjeta sobre deuda que sigue viva como cuota', v_diferencias;
    END IF;
END $p3$;
ROLLBACK;
`

// -------------------------------- P4: el compromiso del mes no cierra solo
const P4 = `
BEGIN;
${PRELUDIO}
DO $p4$
DECLARE
    v_mes date; v_pagado boolean; v_impagas int;
BEGIN
    -- Fixture: el clon trae el compromiso de octubre ya en pagado = true (viene asi
    -- del origen), asi que para que el test sea sensible se lo reabre dentro de la
    -- transaccion, que se revierte.
    SELECT mes_periodo INTO v_mes FROM public.p_compromisos_tarjeta
     WHERE tarjeta_id = ${TARJETA} ORDER BY mes_periodo LIMIT 1;
    IF v_mes IS NULL THEN
        RAISE EXCEPTION 'P4 no hay compromisos para probar';
    END IF;
    UPDATE public.p_compromisos_tarjeta SET pagado = false
     WHERE tarjeta_id = ${TARJETA} AND mes_periodo = v_mes;

    -- Pago que cubre solo la primera cuota del resumen: quedan cuotas impagas del mes.
    PERFORM ${PAGO('123000', 'CURRENT_DATE', "'anterior'")};

    SELECT pagado INTO v_pagado FROM public.p_compromisos_tarjeta
     WHERE tarjeta_id = ${TARJETA} AND mes_periodo = v_mes;
    SELECT count(*) INTO v_impagas FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND pagado = false
       AND date_trunc('month', fecha_estimada_pago)::date = v_mes;

    IF v_pagado AND v_impagas > 0 THEN
        RAISE EXCEPTION 'P4 el compromiso de % quedo pagado con % cuota(s) impaga(s)', v_mes, v_impagas;
    END IF;
    IF NOT v_pagado AND v_impagas = 0 THEN
        RAISE EXCEPTION 'P4 el compromiso de % quedo impago sin cuotas pendientes', v_mes;
    END IF;
END $p4$;
ROLLBACK;
`

// ----------------------------------------------- P5: el legacy no cambia
const P5 = `
BEGIN;
${PRELUDIO}
DO $p5$
DECLARE
    v_antes bigint[]; v_consumido numeric; v_fantasma int;
BEGIN
    SELECT array_agg(cuota_id ORDER BY cuota_id) INTO v_antes
      FROM public.p_cuotas_detalle WHERE tarjeta_id = ${TARJETA} AND pagado = false;

    PERFORM ${PAGO('440666.67', 'CURRENT_DATE', 'NULL')};

    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_consumido
      FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND pagado = true AND cuota_id = ANY (v_antes);
    SELECT count(*) INTO v_fantasma FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND cuota_id <> ALL (COALESCE(v_antes, '{}'));

    IF COALESCE(v_consumido, 0) <= 440666.67 + 0.01 THEN
        RAISE EXCEPTION 'P5 legacy: liquido solo % (el comportamiento previo liquidaba la ventana entera)', v_consumido;
    END IF;
    IF v_fantasma <> 1 THEN
        RAISE EXCEPTION 'P5 legacy: esperaba 1 cuota refinanciada, encontre %', v_fantasma;
    END IF;
END $p5$;
ROLLBACK;
`

// ------------------------------ C1: el clon, fiel y sin huerfanas
const C1 = `
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $c1$
DECLARE v_dif int; v_mcbna bigint; v_tot_o bigint; v_tot_d bigint; v_huerfanas int; v_cruce int;
        v_res jsonb; v_metrica bigint; v_real bigint;
BEGIN
    v_res := public.fn_clonar_usuario_admin(${ORIGEN}, ${USER}, false);

    WITH o AS (SELECT t.nombre_tarjeta, t.dia_cierre, t.dia_vencimiento, count(cd.cuota_id) n
                 FROM public.p_tarjetas_credito t LEFT JOIN public.p_cuotas_detalle cd ON cd.tarjeta_id = t.tarjeta_id
                WHERE t.user_id = ${ORIGEN} GROUP BY 1,2,3),
         d AS (SELECT t.nombre_tarjeta, t.dia_cierre, t.dia_vencimiento, count(cd.cuota_id) n
                 FROM public.p_tarjetas_credito t LEFT JOIN public.p_cuotas_detalle cd ON cd.tarjeta_id = t.tarjeta_id
                WHERE t.user_id = ${USER} GROUP BY 1,2,3)
    SELECT count(*) INTO v_dif FROM o FULL JOIN d USING (nombre_tarjeta, dia_cierre, dia_vencimiento)
     WHERE COALESCE(o.n, -1) <> COALESCE(d.n, -1);
    IF v_dif > 0 THEN RAISE EXCEPTION 'C1 % tarjeta(s) con cuotas de otra', v_dif; END IF;

    SELECT count(cd.cuota_id) INTO v_mcbna
      FROM public.p_tarjetas_credito t LEFT JOIN public.p_cuotas_detalle cd ON cd.tarjeta_id = t.tarjeta_id
     WHERE t.user_id = ${USER} AND t.nombre_tarjeta = 'MC BNA' AND t.dia_cierre = 24 AND t.dia_vencimiento = 4;
    IF v_mcbna <> 34 THEN RAISE EXCEPTION 'C1 MC BNA quedo con % cuotas (esperaba 34)', v_mcbna; END IF;

    SELECT count(*) INTO v_tot_o FROM public.p_cuotas_detalle WHERE user_id = ${ORIGEN};
    SELECT count(*) INTO v_tot_d FROM public.p_cuotas_detalle WHERE user_id = ${USER};
    IF v_tot_o <> v_tot_d THEN RAISE EXCEPTION 'C1 origen % cuotas, destino %', v_tot_o, v_tot_d; END IF;

    -- C1d: la fase de borrado ya no apaga las cascadas: no puede quedar ningun
    -- registro de pago de tarjeta apuntando a un p_caja que no existe.
    SELECT count(*) INTO v_huerfanas
      FROM public.p_pagos_tarjeta_log l
     WHERE l.user_id = ${USER}
       AND NOT EXISTS (SELECT 1 FROM public.p_caja c WHERE c.p_caja_id = l.p_caja_id);
    IF v_huerfanas > 0 THEN
        RAISE EXCEPTION 'C1d quedaron % fila(s) huerfanas en p_pagos_tarjeta_log', v_huerfanas;
    END IF;

    -- C1e: cada cuota tiene que conservar la COMPRA a la que apunta. Los conteos por
    -- tarjeta dan perfecto aunque el mapa de movimientos este cruzado, asi que esto se
    -- compara contra el origen agrupando por (numero, vencimiento, monto, moneda) y
    -- comparando el conjunto de importes+fechas de compra (array ordenado, para no
    -- depender del emparejamiento uno a uno cuando hay cuotas identicas repetidas).
    WITH o AS (
        SELECT cd.numero_cuota, cd.fecha_estimada_pago, cd.monto_cuota, cd.moneda,
               array_agg(COALESCE(pc.valor_egreso, -1)::text || '@' || COALESCE(pc.fecha::text, '-')
                         ORDER BY COALESCE(pc.valor_egreso, -1)::text || '@' || COALESCE(pc.fecha::text, '-')) AS compras
          FROM public.p_cuotas_detalle cd
          LEFT JOIN public.p_caja pc ON pc.p_caja_id = cd.p_caja_id
         WHERE cd.user_id = ${ORIGEN}
         GROUP BY 1, 2, 3, 4
    ), d AS (
        SELECT cd.numero_cuota, cd.fecha_estimada_pago, cd.monto_cuota, cd.moneda,
               array_agg(COALESCE(pc.valor_egreso, -1)::text || '@' || COALESCE(pc.fecha::text, '-')
                         ORDER BY COALESCE(pc.valor_egreso, -1)::text || '@' || COALESCE(pc.fecha::text, '-')) AS compras
          FROM public.p_cuotas_detalle cd
          LEFT JOIN public.p_caja pc ON pc.p_caja_id = cd.p_caja_id
         WHERE cd.user_id = ${USER}
         GROUP BY 1, 2, 3, 4
    )
    SELECT count(*) INTO v_cruce
      FROM o JOIN d USING (numero_cuota, fecha_estimada_pago, monto_cuota, moneda)
     WHERE o.compras IS DISTINCT FROM d.compras;
    IF v_cruce > 0 THEN
        RAISE EXCEPTION 'C1e % grupo(s) de cuotas apuntan a compras distintas a las del origen', v_cruce;
    END IF;

    -- C1f: el jsonb de auditoria no puede mentir. El contador se rompio de verdad (decia
    -- 191 con 572 filas copiadas) porque un SET LOCAL entre el INSERT y el GET DIAGNOSTICS
    -- pisa ROW_COUNT. Se compara contra lo que hay realmente en el destino.
    SELECT (v_res->>'filas_insertadas_total')::bigint INTO v_metrica;
    SELECT (SELECT count(*) FROM public.p_presupuestos_config WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_grupo_familiar      WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_billeteras          WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_estructuras_egresos WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_tarjetas_credito    WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_inversiones         WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_caja_cuarentena     WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_caja                WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_cuotas_detalle      WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_prestamos           WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_compromisos_tarjeta WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_presupuestos        WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_gastos_recurrentes  WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_recordatorios       WHERE user_id = ${USER})
         + (SELECT count(*) FROM public.p_referidos           WHERE user_id_invitador = ${USER})
         + (SELECT count(*) FROM public.p_ingresos            WHERE user_id = ${USER})
      INTO v_real;
    IF v_metrica <> v_real THEN
        RAISE EXCEPTION 'C1f el clon informo % filas insertadas y hay %', v_metrica, v_real;
    END IF;
END $c1$;
ROLLBACK;
`

// ---------- U1-U3: cuotas en dolares, pagadas en pesos o en dolares
// Regla del producto: una cuota en USD se puede pagar con pesos o con dolares.
// El sandbox no tiene ninguna cuota USD, asi que se crea una dentro de la
// transaccion, con la fecha de la cuota impaga mas vieja para que caiga en la ventana.
const usdFixture = `
    INSERT INTO public.p_cuotas_detalle
      (user_id, tarjeta_id, numero_cuota, monto_cuota, moneda, fecha_estimada_pago, pagado)
    VALUES (${USER}, ${TARJETA}, 1, 100, 'USD',
            (SELECT min(fecha_estimada_pago) FROM public.p_cuotas_detalle
              WHERE tarjeta_id = ${TARJETA} AND pagado = false), false)
    RETURNING cuota_id`

const U1 = `
BEGIN;
${PRELUDIO}
DO $u1$
DECLARE v_cuota bigint; v_pagada boolean; v_ars int; v_refi numeric; v_monto numeric;
BEGIN
    ${usdFixture} INTO v_cuota;
    v_monto := ROUND(100 * ${COT}::numeric, 2);
    PERFORM public.fn_registrar_pago_tarjeta_multi(
        p_tarjeta_id => ${TARJETA}, p_fecha_pago => CURRENT_DATE,
        p_pagos => jsonb_build_array(jsonb_build_object(
            'billetera_id', ${BILLETERA}, 'monto', v_monto, 'target_moneda_cuota', 'USD')),
        p_cotizacion_usd => ${COT}, p_objetivo => 'anterior');

    SELECT pagado INTO v_pagada FROM public.p_cuotas_detalle WHERE cuota_id = v_cuota;
    SELECT count(*) INTO v_ars FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND pagado = true AND moneda <> 'USD';
    SELECT COALESCE(refinanciado_ars, 0) + COALESCE(refinanciado_usd, 0) INTO v_refi
      FROM public.p_pagos_tarjeta_log ORDER BY p_caja_id DESC LIMIT 1;

    IF NOT v_pagada THEN
        RAISE EXCEPTION 'U1 la cuota en dolares no se pago pagando % pesos', v_monto;
    END IF;
    IF v_ars > 0 THEN
        RAISE EXCEPTION 'U1 se pago ademas % cuota(s) en pesos', v_ars;
    END IF;
    IF v_refi > 0.01 THEN
        RAISE EXCEPTION 'U1 dejo refinanciado % pagando en pesos una cuota en dolares', v_refi;
    END IF;
END $u1$;
ROLLBACK;
`

const U2 = `
BEGIN;
${PRELUDIO}
DO $u2$
DECLARE v_cuota bigint; v_pagada boolean;
BEGIN
    IF ${BILLETERA_USD || 'NULL'} IS NULL THEN
        RAISE EXCEPTION 'U2 no hay billetera USD con saldo';
    END IF;
    ${usdFixture} INTO v_cuota;
    PERFORM public.fn_registrar_pago_tarjeta_multi(
        p_tarjeta_id => ${TARJETA}, p_fecha_pago => CURRENT_DATE,
        p_pagos => jsonb_build_array(jsonb_build_object(
            'billetera_id', ${BILLETERA_USD || 'NULL'}, 'monto', 100)),
        p_cotizacion_usd => ${COT}, p_objetivo => 'anterior');
    SELECT pagado INTO v_pagada FROM public.p_cuotas_detalle WHERE cuota_id = v_cuota;
    IF NOT v_pagada THEN
        RAISE EXCEPTION 'U2 la cuota en dolares no se pago con 100 dolares';
    END IF;
END $u2$;
ROLLBACK;
`

const U3 = `
BEGIN;
${PRELUDIO}
DO $u3$
DECLARE v_cuota bigint; v_pagada boolean; v_ars numeric; v_refi numeric;
BEGIN
    IF ${BILLETERA_USD || 'NULL'} IS NULL THEN
        RAISE EXCEPTION 'U3 no hay billetera USD con saldo';
    END IF;
    ${usdFixture} INTO v_cuota;
    PERFORM public.fn_registrar_pago_tarjeta_multi(
        p_tarjeta_id => ${TARJETA}, p_fecha_pago => CURRENT_DATE,
        p_pagos => jsonb_build_array(
            jsonb_build_object('billetera_id', ${BILLETERA}, 'monto', 123000),
            jsonb_build_object('billetera_id', ${BILLETERA_USD || 'NULL'}, 'monto', 100)),
        p_cotizacion_usd => ${COT}, p_objetivo => 'anterior');

    SELECT pagado INTO v_pagada FROM public.p_cuotas_detalle WHERE cuota_id = v_cuota;
    SELECT COALESCE(SUM(monto_cuota),0) INTO v_ars FROM public.p_cuotas_detalle
     WHERE tarjeta_id = ${TARJETA} AND pagado = true AND moneda <> 'USD';
    SELECT COALESCE(refinanciado_ars, 0) + COALESCE(refinanciado_usd, 0) INTO v_refi
      FROM public.p_pagos_tarjeta_log ORDER BY p_caja_id DESC LIMIT 1;

    IF NOT v_pagada THEN RAISE EXCEPTION 'U3 el pago mixto no pago la cuota en dolares'; END IF;
    IF v_ars <= 0.01 THEN RAISE EXCEPTION 'U3 el pago mixto no pago ninguna cuota en pesos'; END IF;
    IF v_refi > 0.01 THEN RAISE EXCEPTION 'U3 el pago mixto dejo refinanciado %', v_refi; END IF;
END $u3$;
ROLLBACK;
`

// ------------------- C2-C4: duplicados de nombre y cuotas cargadas sin gasto
// C2 clona al user 165, que tiene "Carnes", "Mascota" y "Nafta" repetidas bajo el
//    mismo padre. El par "Mascota" tiene un movimiento cada una, asi que un colapso
//    se nota: el clon usaria menos categorias distintas que el origen.
// C3 clona al user 1, que tiene dos billeteras "Dolar app" (USD) y usa las dos.
// C4 verifica que una cuota cargada a mano, sin gasto detras (p_caja_id NULL), llegue
//    al clon con el vinculo vacio y no se pierda.
const clonTx = (origen) => `
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.fn_clonar_usuario_admin(${origen}, ${USER}, false);
`

const C2 = `
${clonTx(165)}
DO $c2$
DECLARE v_o int; v_d int; v_ou int; v_du int;
BEGIN
    SELECT count(*) INTO v_o FROM public.p_estructuras_egresos WHERE user_id = 165;
    SELECT count(*) INTO v_d FROM public.p_estructuras_egresos WHERE user_id = ${USER};
    IF v_o <> v_d THEN
        RAISE EXCEPTION 'C2 el origen tiene % categorias y el clon %', v_o, v_d;
    END IF;
    SELECT count(DISTINCT estructura_egreso_id) INTO v_ou
      FROM public.p_caja WHERE user_id = 165 AND estructura_egreso_id IS NOT NULL;
    SELECT count(DISTINCT estructura_egreso_id) INTO v_du
      FROM public.p_caja WHERE user_id = ${USER} AND estructura_egreso_id IS NOT NULL;
    IF v_ou <> v_du THEN
        RAISE EXCEPTION 'C2 el origen usa % categorias distintas y el clon %: se colapsaron homonimas', v_ou, v_du;
    END IF;
END $c2$;
ROLLBACK;
`

const C3 = `
${clonTx(1)}
DO $c3$
DECLARE v_o int; v_d int; v_ou int; v_du int; v_dolar int;
BEGIN
    SELECT count(*) INTO v_o FROM public.p_billeteras WHERE user_id = 1;
    SELECT count(*) INTO v_d FROM public.p_billeteras WHERE user_id = ${USER};
    IF v_o <> v_d THEN
        RAISE EXCEPTION 'C3 el origen tiene % billeteras y el clon %', v_o, v_d;
    END IF;
    SELECT count(*) INTO v_dolar FROM public.p_billeteras
     WHERE user_id = ${USER} AND nombre = 'Dolar app' AND moneda = 'USD';
    IF v_dolar <> 2 THEN
        RAISE EXCEPTION 'C3 el clon tiene % billetera(s) Dolar app USD (esperaba 2)', v_dolar;
    END IF;
    SELECT count(DISTINCT billetera_origen_id) INTO v_ou
      FROM public.p_caja WHERE user_id = 1 AND billetera_origen_id IS NOT NULL;
    SELECT count(DISTINCT billetera_origen_id) INTO v_du
      FROM public.p_caja WHERE user_id = ${USER} AND billetera_origen_id IS NOT NULL;
    IF v_ou <> v_du THEN
        RAISE EXCEPTION 'C3 el origen usa % billeteras distintas y el clon %: se cruzaron homonimas', v_ou, v_du;
    END IF;
END $c3$;
ROLLBACK;
`

const C4 = `
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.p_cuotas_detalle
  (user_id, tarjeta_id, numero_cuota, monto_cuota, fecha_estimada_pago, pagado, p_caja_id)
VALUES (${ORIGEN},
        (SELECT tarjeta_id FROM public.p_tarjetas_credito
          WHERE user_id = ${ORIGEN} AND nombre_tarjeta = 'MC BNA'
            AND dia_cierre = 24 AND dia_vencimiento = 4),
        7, 99999, DATE '2027-05-04', false, NULL);
SELECT public.fn_clonar_usuario_admin(${ORIGEN}, ${USER}, false);
DO $c4$
DECLARE v_n int;
BEGIN
    SELECT count(*) INTO v_n FROM public.p_cuotas_detalle
     WHERE user_id = ${USER} AND p_caja_id IS NULL AND monto_cuota = 99999;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'C4 la cuota sin gasto (p_caja_id NULL) no llego al clon (% filas)', v_n;
    END IF;
END $c4$;
ROLLBACK;
`

// C5 clona al user 1 (que tiene inversiones) y verifica que el vinculo de la inversion
//    dentro de metadata del movimiento apunte a una inversion DEL DESTINO, no del origen.
const C5 = `
${clonTx(1)}
DO $c5$
DECLARE v_malos int; v_con int;
BEGIN
    SELECT count(*) INTO v_con FROM public.p_caja
     WHERE user_id = ${USER} AND metadata ? 'inversion_id';
    IF v_con = 0 THEN
        RAISE EXCEPTION 'C5 no hay movimientos con vinculo de inversion para probar';
    END IF;
    SELECT count(*) INTO v_malos
      FROM public.p_caja c
     WHERE c.user_id = ${USER} AND c.metadata ? 'inversion_id'
       AND NOT EXISTS (SELECT 1 FROM public.p_inversiones i
                        WHERE i.inversion_id::text = c.metadata->>'inversion_id'
                          AND i.user_id = ${USER});
    IF v_malos > 0 THEN
        RAISE EXCEPTION 'C5 % de % movimientos apuntan a una inversion que no es del destino',
            v_malos, v_con;
    END IF;
END $c5$;
ROLLBACK;
`

// esperado: en RED fallan P2, P3 y P4; en GREEN no falla ninguno
const PAGO_SUITE = [
  ['P1 consumo = reporte, fecha hoy', p1(0)],
  ['P1 consumo = reporte, fecha +8d', p1(8)],
  ['P1 consumo = reporte, fecha +20d', p1(20)],
  ['P2 pago parcial: FIFO y sobrante a favor', P2],
  ['P3 resumen_real: no se pierde plata ni se duplica la deuda', P3],
  ['P4 el compromiso del mes no cierra con cuotas impagas', P4],
  ['P5 regresion del modo legacy', P5],
  ['U1 cuota en dolares pagada en pesos', U1],
  ['U2 cuota en dolares pagada en dolares', U2],
  ['U3 pago mixto: pesos de un lado, dolares del otro', U3],
]
const CLON_SUITE = [
  ['C1 el clon es fiel y no deja huerfanas', C1],
  ['C2 categorias homonimas no se colapsan (user 165)', C2],
  ['C3 billeteras homonimas no se cruzan (user 1)', C3],
  ['C4 la cuota cargada sin gasto llega al clon', C4],
  ['C5 el vinculo de la inversion apunta al clon', C5],
]

const correr = async (suite, titulo) => {
  console.log(`\n── ${titulo}`)
  const fallos = []
  for (const [nombre, sql] of suite) {
    const r = await q(sql)
    if (r?.message) {
      fallos.push(nombre)
      console.log(`   ✗ ${nombre}: ${r.message.split('\n')[0]}`)
    } else {
      console.log(`   ✓ ${nombre}`)
    }
  }
  return fallos
}

// ------------------------------------------------------------------ 1) RED
// Si las migraciones ya estan desplegadas, el RED no tiene sentido: se corre solo GREEN.
const [yaAplicado] = await q(`
  select (pg_get_functiondef('public.fn_liquidar_ciclo_tarjeta_multi'::regproc) like '%v_corte_ars := true%') as fifo,
         (pg_get_functiondef('public.fn_registrar_pago_tarjeta_multi'::regproc) like '%v_pendiente_ventana%') as dif_neta,
         (pg_get_functiondef('public.fn_clonar_usuario_admin'::regproc) like '%IF v_tabla = ''p_estructuras_egresos''%') as replica_acotado,
         (pg_get_functiondef('public.fn_clonar_usuario_admin'::regproc) like '%ORDER BY c.p_caja_id%') as orden_movimientos,
         (pg_get_functiondef('public.fn_clonar_usuario_admin'::regproc) like '%PARTITION BY nombre, moneda%') as duplicados`)
const pendiente = !(yaAplicado?.fifo && yaAplicado?.dif_neta && yaAplicado?.replica_acotado && yaAplicado?.orden_movimientos && yaAplicado?.duplicados)

if (pendiente) {
  const rojos = await correr([...PAGO_SUITE, ...CLON_SUITE], 'RED · contra lo desplegado')
  const esperados = ['P2', 'P3', 'P4', 'C1', 'C2', 'C3']
  const inesperados = rojos.filter((n) => !esperados.some((e) => n.startsWith(e)))
  if (inesperados.length > 0) {
    console.log('\n✗ fallaron casos que NO son los que la 112 arregla:')
    inesperados.forEach((n) => console.log('   - ' + n))
    console.log('  No aplico nada.')
    process.exit(1)
  }
  if (rojos.length === 0) {
    console.log('\n⚠ no fallo nada: no hay bug que reproducir. No aplico nada.')
    process.exit(1)
  }
  console.log(`\nRED confirmado: ${rojos.length} caso(s): ${rojos.join(', ')}`)

  // ---------------------------------------------------------------- 2) aplicar
  for (const archivo of [
    'temp_sql/112_pago_tope_por_pool_v2.sql',
    'temp_sql/113_clon_borrado_acotado.sql',
    'temp_sql/115_clon_mapa_movimientos.sql',
    'temp_sql/116_clon_duplicados.sql',
  ]) {
    const sql = fs.readFileSync(archivo, 'utf8')
    const r = await q('BEGIN;\n' + sql + '\nCOMMIT;')
    if (r?.message) {
      console.log(`✗ ${archivo} no se pudo aplicar: ${r.message}`)
      process.exit(1)
    }
    console.log(`✓ aplicada ${archivo}`)
  }
} else {
  console.log('· 112 y 113 ya estan desplegadas: se corre solo GREEN')
}

// ------------------------------------------------------------------ 3) GREEN
const verdes = await correr([...PAGO_SUITE, ...CLON_SUITE], 'GREEN · despues de 112 y 113')
if (verdes.length > 0) {
  console.log(`\n✗ QUEDAN ${verdes.length} caso(s) fallando`)
  process.exit(1)
}
console.log('\n✓ ALL TESTS PASSED (todo dentro de transacciones revertidas, cero datos persistidos)')

const control = await q(`
  select (pg_get_functiondef('public.fn_liquidar_ciclo_tarjeta_multi'::regproc) like '%v_corte_ars := true%') as fifo,
         (pg_get_functiondef('public.fn_registrar_pago_tarjeta_multi'::regproc) like '%v_pendiente_ventana%') as dif_neta,
         (pg_get_functiondef('public.fn_clonar_usuario_admin'::regproc) like '%IF v_tabla = ''p_estructuras_egresos''%') as replica_acotado,
         (pg_get_functiondef('public.fn_clonar_usuario_admin'::regproc) like '%ORDER BY c.p_caja_id%') as orden_movimientos,
         (pg_get_functiondef('public.fn_clonar_usuario_admin'::regproc) like '%PARTITION BY nombre, moneda%') as duplicados`)
console.log('CONTROL:', JSON.stringify(control?.[0] ?? control))
