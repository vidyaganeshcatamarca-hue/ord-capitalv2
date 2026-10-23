// READ-ONLY probe: estado vivo de modo avanzado / feature flags (sin writes).
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

const out = {}
out.columns = await q(`select column_name, data_type, is_nullable, column_default
  from information_schema.columns where table_schema='public' and table_name='app_feature_flags' order by ordinal_position`)
out.rows = await q(`select * from app_feature_flags order by orden`)
out.global = await q(`select clave, valor, descripcion from app_global_config where clave like 'modo_avanzado%' or clave like 'trial%' order by clave`)
out.fn_def = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('fn_obtener_modo_app','fn_activar_modo_avanzado','fn_desactivar_modo_avanzado')`)
out.usage = await q(`select p.proname, pg_get_function_arguments(p.oid) as args from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'fn_%modo%'`)
console.log(JSON.stringify(out, null, 1))
