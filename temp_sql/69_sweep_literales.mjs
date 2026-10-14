// Barrido: literales 'ARS'/'USD' en el SQL fuente de TODAS las funciones publicas.
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
const rows = (await q(`
SELECT * FROM (
SELECT p.proname,
       pg_get_function_arguments(p.oid) args,
       (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), chr(39) || 'ARS' || chr(39), ''))) / 4 AS n_ars,
       (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), chr(39) || 'USD' || chr(39), ''))) / 4 AS n_usd,
       (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), chr(39) || 'RON' || chr(39), ''))) / 4 AS n_ron
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
) x ORDER BY x.n_ars + x.n_usd DESC, x.proname`))
const hits = rows.filter(r => r.n_ars + r.n_usd > 0)
console.log('funciones con literales:', hits.length)
fs.writeFileSync('temp_sql/69_sweep_literales.json', JSON.stringify(hits, null, 1))
for (const h of hits) console.log(`${h.n_ars} ARS / ${h.n_usd} USD  ${h.proname}(${String(h.args).slice(0, 60)})`)