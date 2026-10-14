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
console.log(JSON.stringify(await q(`
SELECT c.user_id, r.moneda_default, c.moneda, count(*) n, sum(c.valor_ingreso) ing, sum(c.valor_egreso) eg,
       min(c.valor_local) min_vl, max(c.valor_local) max_vl, count(*) FILTER (WHERE c.moneda IS DISTINCT FROM r.moneda_default) inconsistentes
FROM p_caja c JOIN p_config_region r ON r.user_id = c.user_id
WHERE c.user_id IN (183, 195) GROUP BY c.user_id, r.moneda_default, c.moneda ORDER BY c.user_id, n DESC`), null, 1))
console.log('total filas p_caja users 183/195:', JSON.stringify(await q(`
SELECT user_id, count(*) FROM p_caja WHERE user_id IN (183,195) GROUP BY user_id`)))