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
// El "resto de gastos" que restan en capacidad: los tipo!=expense y con tarjeta_id NO entran.
console.log(JSON.stringify(await q(`
SELECT tipo, (tarjeta_id IS NOT NULL) con_tarjeta, count(*) n, COALESCE(sum(valor_egreso),0) egreso_180d
FROM p_caja
WHERE user_id = 1 AND fecha >= CURRENT_DATE - INTERVAL '180 days' AND valor_egreso > 0
GROUP BY tipo, con_tarjeta ORDER BY n DESC`), null, 1))