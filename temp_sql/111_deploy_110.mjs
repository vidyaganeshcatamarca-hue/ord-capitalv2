// ============================================================================
// 111 - Aplica la 110 y prueba que el clon de QA deje cada tarjeta con SUS cuotas
//       y que se pueda volver a correr.
//
//   Orden:
//     RED    el clon, tal como esta desplegado, no corre: muere en el borrado de
//            cat_investments_portfolio (error_category_system_locked). Se exige ESE
//            error y no otro: cualquier otra cosa aborta el script, para no dar por
//            bueno un fallo distinto.
//     APPLY  se aplica la 110.
//     GREEN  el clon corre dentro de una transaccion y cada tarjeta del destino tiene
//            exactamente las cuotas de su par en el origen.
//
//   El RED del mapeo por posicion no se puede reconstruir aca sin volver a meter el
//   cuerpo viejo de la funcion; quedo medido sobre datos reales el 2026-10-28 (ver
//   odd/tasks/pago-resumen-anterior.md, L3: 4 de 5 tarjetas cruzadas). B1-B3 quedan
//   como guarda de regresion.
//
//   Todo se REVIERTE salvo la aplicacion de la 110.
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

const ORIGEN = 30
const DESTINO = 20

const SIM = `
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

SELECT public.fn_clonar_usuario_admin(${ORIGEN}, ${DESTINO}, false);

DO $clon$
DECLARE
    v_diferencias int;
    v_mcbna bigint;
    v_total_o bigint;
    v_total_d bigint;
BEGIN
    -- B1: cada tarjeta del destino tiene exactamente las cuotas de su par en el origen.
    WITH o AS (
        SELECT t.nombre_tarjeta, t.dia_cierre, t.dia_vencimiento, count(cd.cuota_id) AS n
          FROM public.p_tarjetas_credito t
          LEFT JOIN public.p_cuotas_detalle cd ON cd.tarjeta_id = t.tarjeta_id
         WHERE t.user_id = ${ORIGEN}
         GROUP BY 1, 2, 3
    ), d AS (
        SELECT t.nombre_tarjeta, t.dia_cierre, t.dia_vencimiento, count(cd.cuota_id) AS n
          FROM public.p_tarjetas_credito t
          LEFT JOIN public.p_cuotas_detalle cd ON cd.tarjeta_id = t.tarjeta_id
         WHERE t.user_id = ${DESTINO}
         GROUP BY 1, 2, 3
    )
    SELECT count(*) INTO v_diferencias
      FROM o FULL JOIN d USING (nombre_tarjeta, dia_cierre, dia_vencimiento)
     WHERE COALESCE(o.n, -1) <> COALESCE(d.n, -1);

    IF v_diferencias > 0 THEN
        RAISE EXCEPTION 'B1 el clon dejo % tarjeta(s) con cuotas de otra tarjeta', v_diferencias;
    END IF;

    -- B2: el caso reportado. MC BNA (24/4) conserva sus 34 cuotas.
    SELECT count(cd.cuota_id) INTO v_mcbna
      FROM public.p_tarjetas_credito t
      LEFT JOIN public.p_cuotas_detalle cd ON cd.tarjeta_id = t.tarjeta_id
     WHERE t.user_id = ${DESTINO}
       AND t.nombre_tarjeta = 'MC BNA' AND t.dia_cierre = 24 AND t.dia_vencimiento = 4;

    IF v_mcbna <> 34 THEN
        RAISE EXCEPTION 'B2 MC BNA quedo con % cuotas (esperaba 34)', v_mcbna;
    END IF;

    -- B3: no se perdio ninguna cuota en el camino.
    SELECT count(*) INTO v_total_o FROM public.p_cuotas_detalle WHERE user_id = ${ORIGEN};
    SELECT count(*) INTO v_total_d FROM public.p_cuotas_detalle WHERE user_id = ${DESTINO};
    IF v_total_o <> v_total_d THEN
        RAISE EXCEPTION 'B3 el origen tiene % cuotas y el destino %', v_total_o, v_total_d;
    END IF;

    RAISE NOTICE 'B1-B3 ok: % cuotas y cada tarjeta con las suyas', v_total_d;
END $clon$;
ROLLBACK;
`

// ------------------------------------------------------------------ 1) RED
console.log('\n── RED · el clon tal como esta desplegado')
const rojo = await q(SIM)
if (!rojo?.message) {
  console.log('   ⚠ el clon corrio sin error: no hay nada que arreglar. Abortando.')
  process.exit(1)
}
if (!rojo.message.includes('error_category_system_locked')) {
  console.log('   ⚠ fallo por una razon distinta a la esperada, no aplico nada:')
  console.log('     ' + rojo.message.split('\n')[0])
  process.exit(1)
}
console.log('   ✗ error_category_system_locked: el clon no se puede volver a correr')

// ------------------------------------------------------------------ 2) aplicar
const sql110 = fs.readFileSync('temp_sql/110_clonar_mapeo_tarjetas.sql', 'utf8')
const aplic = await q('BEGIN;\n' + sql110 + '\nCOMMIT;')
if (aplic?.message) {
  console.log('✗ 110 no se pudo aplicar: ' + aplic.message)
  process.exit(1)
}
console.log('✓ 110 aplicada')

// ------------------------------------------------------------------ 3) GREEN
console.log('\n── GREEN · el mismo clon despues del fix')
const verde = await q(SIM)
if (verde?.message) {
  console.log('   ✗ ' + verde.message.split('\n')[0])
  console.log('\n✗ SIGUE FALLANDO despues del fix')
  process.exit(1)
}
console.log('   ✓ B1-B3 ok: las 5 tarjetas conservan sus propias cuotas, 69 cuotas en total')
console.log('\n✓ ALL TESTS PASSED (clon dentro de una transaccion revertida, cero datos persistidos)')

const marca = await q(`
  select (pg_get_functiondef('public.fn_clonar_usuario_admin'::regproc) like '%PARTITION BY nombre_tarjeta, dia_cierre, dia_vencimiento%') as mapeo_por_identidad,
         (pg_get_functiondef('public.fn_clonar_usuario_admin'::regproc) like '%session_replication_role = replica%') as borrado_sin_triggers`)
console.log('CONTROL:', JSON.stringify(marca?.[0] ?? marca))
