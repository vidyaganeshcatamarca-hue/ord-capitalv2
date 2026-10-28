import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => (await (await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})).json())
const fns = await q(`select p.proname, pg_get_function_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like '%inversion%' order by p.proname`)
console.log('FUNCIONES DE INVERSIONES')
for (const f of fns) console.log('  ' + f.proname + '(' + f.args + ')')
const elim = await q(`select pg_get_functiondef(oid) as d from pg_proc where proname in ('fn_eliminar_inversion','fn_borrar_inversion') limit 1`)
if (elim[0]?.d) console.log('\n--- CUERPO BORRADO ---\n' + elim[0].d.slice(0, 2200))
const caja = await q(`select column_name, is_nullable from information_schema.columns where table_name='p_caja' and column_name in ('billetera_origen_id','billetera_destino_id','tipo')`)
console.log('\np_caja: ' + JSON.stringify(caja))
