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
console.log('=== Estado de las 8 funciones tras el fallo ===')
const rows = await q(`select p.proname, pg_get_function_result(p.oid) as returns
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
  ('fn_crear_inversion','fn_reporte_cartera_inversiones','fn_reporte_historial_inversiones',
   'fn_reporte_patrimonio_inversiones','fn_reporte_rendimiento_vs_inflacion',
   'fn_reporte_distribucion_activos','fn_liquidar_inversion','fn_obtener_config_inflacion')
  order by p.proname`)
for (const r of rows) console.log(`- ${r.proname} -> ${r.returns}`)
const falta = await q(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fn_obtener_config_inflacion'`)
console.log('\nfn_obtener_config_inflacion existe:', falta[0].n > 0)
