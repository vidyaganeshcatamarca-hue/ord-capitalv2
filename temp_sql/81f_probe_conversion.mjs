import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 800))
  return json
}
for (const name of ['fn_valor_a_moneda_local', 'fn_obtener_cotizacion']) {
  const rows = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='${name}'`)
  console.log('### ' + name + '\n' + (rows[0]?.def || 'NO EXISTE') + '\n')
}
const cols = await q(`select column_name, data_type from information_schema.columns
  where table_schema='public' and table_name='p_config_region' order by ordinal_position`)
console.log('=== p_config_region columns ===')
for (const c of cols) console.log(`- ${c.column_name} ${c.data_type}`)
