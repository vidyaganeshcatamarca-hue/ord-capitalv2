import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 800))
  return json
}
const rows = await q(`select p.proname, p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('fn_crear_subcuenta_egreso','fn_registrar_movimiento_caja','fn_editar_movimiento_caja')
  order by p.proname, p.oid::regprocedure::text`)
let out = ''
for (const r of rows) { out += '#### ' + r.proname + ' [' + r.sig + ']\n' + r.def + '\n\n' }
fs.writeFileSync('temp_sql/83_funcs_originales.sql', out)
console.log('dump escrito, lineas:', out.split('\n').length)
