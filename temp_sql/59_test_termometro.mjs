// Test consistencia termómetro (sin rollback de datos: solo lecturas).
// Aserciones:
// 1. capacidad = ingreso_prom - gasto_con_tarjeta_id_NULL_prom (excluye TODAS las tarjetas).
// 2. cuota_proxima = min fecha_estimada de cuotas impagas, con moneda real.
// 3. indice = pendiente_equiv / meses_restantes / capacidad * 100 (tolerancia 0.05).
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { ACCESS_TOKEN, SUPABASE_URL } = env
const PROJECT = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)?.[1]
const AUTH = 'b90d1f17-f691-491a-a840-522510e67640'
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
const out = []
for (const card of [2, 9]) {
  const rows = await q(`BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"${AUTH}","role":"authenticated"}', true);
SELECT t.*,
  (SELECT COALESCE(SUM(valor_ingreso),0)/6 FROM p_caja WHERE user_id=1 AND tipo='income' AND fecha >= CURRENT_DATE - INTERVAL '180 days') AS ing,
  (SELECT COALESCE(SUM(valor_egreso),0)/6 FROM p_caja WHERE user_id=1 AND tipo='expense' AND tarjeta_id IS NULL AND fecha >= CURRENT_DATE - INTERVAL '180 days') AS resto,
  (SELECT COALESCE(SUM(P.monto_local),0) FROM (
     SELECT cd.fecha_estimada_pago, (fn_valor_a_moneda_local(cd.monto_cuota, cd.moneda, 1)).valor AS monto_local
     FROM p_cuotas_detalle cd WHERE cd.tarjeta_id=${card} AND cd.pagado=false) P) AS pendiente_equiv,
  (SELECT max(fecha_estimada_pago) FROM p_cuotas_detalle WHERE tarjeta_id=${card} AND pagado=false) AS ultima,
  (SELECT min(fecha_estimada_pago) FROM p_cuotas_detalle WHERE tarjeta_id=${card} AND pagado=false) AS primera,
  (SELECT cd.moneda FROM p_cuotas_detalle cd WHERE cd.tarjeta_id=${card} AND cd.pagado=false ORDER BY cd.fecha_estimada_pago LIMIT 1) AS mono_prox
FROM fn_reporte_termometro_tarjeta(${card}) t;
COMMIT;`)
  const r = rows.at(-1)
  const meses = Math.max(1, Math.ceil((new Date(r.ultima).getTime() - Date.now())/30/86400000))
  const esperado = Number(r.pendiente_equiv) / meses / Number(r.capacidad_pago_promedio) * 100
  const capEsp = Number(r.ing) - Number(r.resto)
  const checks = [
    ['capacidad', Math.abs(capEsp - Number(r.capacidad_pago_promedio)) < 0.01, capEsp, r.capacidad_pago_promedio],
    ['proxima', r.primera === r.fecha_proxima, r.primera, r.fecha_proxima],
    ['moneda', r.mono_prox === r.moneda_proxima, r.mono_prox, r.moneda_proxima],
    ['indice', Math.abs(esperado - Number(r.indice_estres)) < 0.05, esperado.toFixed(2), r.indice_estres],
  ]
  const fail = checks.filter(c => !c[1])
  out.push({ card, checks, veredicto: fail.length ? 'FAIL' : 'PASS' })
  if (fail.length) { console.error(JSON.stringify(out, null, 1)); process.exit(1) }
}
console.log(JSON.stringify(out, null, 1))