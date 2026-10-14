// Termómetro live para user 1: descomposición de la fórmula + ventana de cuota proxima
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
const AUTH = 'b90d1f17-f691-491a-a840-522510e67640'
const run1 = `BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"${AUTH}","role":"authenticated"}', true);
SELECT public.fn_reporte_termometro_tarjeta(2) AS galicia;
SELECT public.fn_reporte_termometro_tarjeta(9) AS ashram;
COMMIT;`
console.log('termometro galicia/ashram:', JSON.stringify(await q(run1)))

console.log('capacidad user1:', JSON.stringify(await q(`
SELECT
  (SELECT COALESCE(SUM(valor_ingreso),0)/6 FROM p_caja WHERE user_id=1 AND tipo='income' AND fecha >= CURRENT_DATE - INTERVAL '180 days') ingreso_prom,
  (SELECT COALESCE(SUM(valor_egreso),0)/6 FROM p_caja WHERE user_id=1 AND tipo='expense' AND tarjeta_id IS NULL AND fecha >= CURRENT_DATE - INTERVAL '180 days') resto_gasto_prom`)))

console.log('ciclo presupuesto user1:', JSON.stringify(await q(`BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"${AUTH}","role":"authenticated"}', true);
SELECT * FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
COMMIT;`)))