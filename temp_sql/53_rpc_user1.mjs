// Diagnóstico parte 2: cuotas por movimiento + RPCs ejecutadas como user 1.
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { ACCESS_TOKEN, SUPABASE_URL } = env
const PROJECT = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]

const q = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json))
  return json
}
const out = (label, rows) => console.log(`\n== ${label}\n${JSON.stringify(rows, null, 1).slice(0, 3500)}`)

// 0. auth_id del owner
const auth1 = await q(`SELECT auth_id FROM usuarios WHERE user_id = 1`)
const AUTH_ID = auth1[0]?.auth_id
console.log('auth_id user 1 =', AUTH_ID)

// 1. Movimientos ago-oct con cuotas_totales y cuantas cuotas detalle tienen
out('cuotas generadas por mov oct (voz)', await q(`
SELECT m.p_caja_id, m.fecha, m.valor_egreso, m.cuotas_totales, m.metadata->>'origen_cuarentena' origen,
       (SELECT count(*) FROM p_cuotas_detalle cd WHERE cd.p_caja_id = m.p_caja_id) cuotas_generadas,
       (SELECT min(cd.fecha_estimada_pago) FROM p_cuotas_detalle cd WHERE cd.p_caja_id = m.p_caja_id) min_pago
FROM p_caja m WHERE m.user_id = 1 AND m.tarjeta_id IS NOT NULL AND m.cuotas_totales > 0
AND m.fecha >= date '2026-08-01' ORDER BY m.p_caja_id DESC LIMIT 12`))

// 1b. Alcance global: movimientos con cuotas Totales sin filas en p_cuotas_detalle
out('global: movs con cuotas sin detalle', await q(`
SELECT count(*) total_movs,
       count(*) FILTER (WHERE metadata->>'origen_cuarentena' = 'voz') de_voz,
       count(*) FILTER (WHERE metadata->>'origen_cuarentena' IS DISTINCT FROM 'voz') manuales,
       sum(cuotas_totales) cuotas_que_faltarian
FROM p_caja m
WHERE m.tipo = 'expense' AND m.tarjeta_id IS NOT NULL AND m.cuotas_totales > 0
  AND NOT EXISTS (SELECT 1 FROM p_cuotas_detalle cd WHERE cd.p_caja_id = m.p_caja_id)
  AND (SELECT count(*) FROM p_cuotas_detalle cd2 WHERE cd2.p_caja_id = m.p_caja_id) = 0`))

out('global: por mes de los movs sin cuotas', await q(`
SELECT date_trunc('month', m.fecha)::date mes, count(*), sum(m.cuotas_totales) cuotas_falt
FROM p_caja m
WHERE m.tipo = 'expense' AND m.tarjeta_id IS NOT NULL AND m.cuotas_totales > 0
  AND NOT EXISTS (SELECT 1 FROM p_cuotas_detalle cd WHERE cd.p_caja_id = m.p_caja_id)
GROUP BY mes ORDER BY mes`))

// 1c. Muestras de los 'manuales' sin cuotas
out('muestras manuales sin cuotas', await q(`
SELECT m.p_caja_id, m.fecha, m.cuotas_totales, m.metadata->>'origen_cuarentena' origen, m.metadata->>'job_id' job,
       left(COALESCE(m.detalle,''), 30) det, m.moneda
FROM p_caja m
WHERE m.tipo = 'expense' AND m.tarjeta_id IS NOT NULL AND m.cuotas_totales > 0
  AND NOT EXISTS (SELECT 1 FROM p_cuotas_detalle cd WHERE cd.p_caja_id = m.p_caja_id)
ORDER BY m.p_caja_id DESC LIMIT 15`))

// 2. RPCs ejecutadas como user 1 (transaccion + claims)
const run_as_user = async (fn) => {
  return q(`BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"${AUTH_ID}","role":"authenticated"}', true);
SELECT ${fn}();
ROLLBACK;`)
}
out('fn_reporte_vencimientos_tarjetas(user1)', await run_as_user('public.fn_reporte_vencimientos_tarjetas'))
out('fn_reporte_mapa_tarjetas(user1)', await run_as_user('public.fn_reporte_mapa_tarjetas'))
out('fn_obtener_saldo_pasivo_tarjetas(user1)', await run_as_user('public.fn_obtener_saldo_pasivo_tarjetas'))