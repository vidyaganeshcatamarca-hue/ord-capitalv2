// Diagnóstico READ-ONLY parte 2: firma exacta y defaults de las RPC de inversiones.
// Uso: node temp_sql/81b_probe_inversiones_firmas.mjs
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

console.log('=== A. RPC distribucion / sugerir / estado (public) ===')
const fns = await q(`
  select p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as returns,
         case when p.proargdefaults is null then '(sin defaults)' else p.proargdefaults::text end as defaults,
         p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname ~* 'distribucion|sugerir|estado_inversion|rescatar|crear_inversion|liquidar|actualizar_valor|configurar_inflacion'
  order by p.proname`)
for (const f of fns) console.log(`- ${f.name}(${f.args}) -> ${f.returns}\n    defaults=${f.defaults} secdef=${f.security_definer}`)

console.log('\n=== B. Vistas relacionadas con inversiones ===')
const views = await q(`
  select table_name, table_type from information_schema.tables
  where table_schema = 'public' and table_name ~* 'inversion|cartera' and table_type <> 'BASE TABLE'
  order by table_name`)
if (views.length === 0) console.log('(sin vistas)')
for (const v of views) console.log(`- ${v.table_name} [${v.table_type}]`)