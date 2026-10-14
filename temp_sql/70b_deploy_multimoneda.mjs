// Deploy WU4c-lite multimoneda: ensayo rollback primero, luego real.
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
const ddl = fs.readFileSync('temp_sql/70_deploy_tmp.sql', 'utf8')
const ensayo = `BEGIN;\n${ddl}\nROLLBACK;`
console.log('ensayo...')
await q(ensayo)
console.log('ensayo OK (rollback)')
// real
await q(ddl)
console.log('deploy REAL ok')
// smoke: crear tarjeta con claims (rollback)
const a = await q(`BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"b90d1f17-f691-491a-a840-522510e67640","role":"authenticated"}', true);
SELECT fn_crear_tarjeta_credito('humo', 'b', 10, 5, 0, 0, '#000000');
SELECT moneda_iso FROM p_tarjetas_credito WHERE nombre_tarjeta='humo';
ROLLBACK;`)
console.log('humo ARS user:', JSON.stringify(a.at(-1)))