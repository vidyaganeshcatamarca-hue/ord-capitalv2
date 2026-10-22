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
const rows = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='fn_reporte_patrimonio_neto'`)
const def = rows[0]?.def || '(no encontrada)'
console.log(def.split('\n').filter(l => /inversion|p_inversion|cartera/i.test(l)).join('\n') || '(fn_reporte_patrimonio_neto NO menciona inversiones)')
console.log('--- total lineas:', def.split('\n').length)
