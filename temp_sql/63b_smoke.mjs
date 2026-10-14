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
// Humo: carga en transaccion + ROLLBACK (nada persiste)
const sql = `BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"b90d1f17-f691-491a-a840-522510e67640","role":"authenticated"}', true);
SELECT public.fn_registrar_cuotas_historicas(2, 'humo test', 3, 1000, CURRENT_DATE + 1, 'ARS', NULL) AS carga;
SELECT carga_id, numero_cuota, monto_cuota, fecha_estimada_pago, descripcion, carga_id FROM p_cuotas_detalle WHERE descripcion = 'humo test' ORDER BY numero_cuota;
ROLLBACK;`
const out = await q(sql)
console.log(JSON.stringify(out, null, 1))