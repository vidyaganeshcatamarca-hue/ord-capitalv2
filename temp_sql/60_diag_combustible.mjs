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
// Ultimos movimientos de user 1 (hoy)
console.log('movs de hoy:', JSON.stringify(await q(`
SELECT p_caja_id, fecha, tipo, tarjeta_id, cuotas_totales, valor_egreso, moneda, metadata, creado_at
FROM p_caja WHERE user_id = 1 ORDER BY creado_at DESC LIMIT 5`), null, 1))
// ¿cuotas para el movimiento de combustible?
console.log('cuotas tarjetas de ultimo mov:', JSON.stringify(await q(`
SELECT * FROM p_cuotas_detalle WHERE user_id = 1 ORDER BY creado_at DESC LIMIT 3`), null, 1))