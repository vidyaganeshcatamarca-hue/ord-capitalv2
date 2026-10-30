import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,300));return j}
const MES = '2026-10-01'
const snapshot = (uid) => `
  select to_jsonb(t) as fila from (
    select *, null as _x from (select set_config('request.jwt.claims',
      json_build_object('sub',(select auth_id from usuarios where user_id=${uid}),'role','authenticated')::text,true) as _c) c
    cross join lateral fn_reporte_sobres_detalle('${MES}'::date) t) t`
const acl = await q(`select coalesce(array_to_string(p.proacl,','),'(default)') a from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_reporte_sobres_detalle'`)
console.log('ACL antes:', acl[0]?.a)

const antes = {}
for (const uid of [1, 84]) {
  const rows = await q(`select jsonb_agg(to_jsonb(x) - 'es_padre' - 'cuenta_en_totales' order by x.estructura_id) j from (
     select * from (select set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=${uid}),'role','authenticated')::text,true) as _c) c
     cross join lateral fn_reporte_sobres_detalle('${MES}'::date) t) x`)
  antes[uid] = JSON.stringify(rows[0].j)
}
console.log('filas antes: u1', JSON.parse(antes[1]).length, '| u84', JSON.parse(antes[84]).length)

await q(fs.readFileSync('temp_sql/151_reporte_padres.sql','utf8'))
await q(`grant execute on function public.fn_reporte_sobres_detalle(date) to authenticated`)
console.log('\n151 desplegado')

let ok = true
for (const uid of [1, 84]) {
  const rows = await q(`select jsonb_agg(to_jsonb(x) - 'es_padre' - 'cuenta_en_totales' order by x.estructura_id) j,
     count(*) filter (where x.cuenta_en_totales) as cuentan, count(*) as total
     from (select * from (select set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=${uid}),'role','authenticated')::text,true) as _c) c
     cross join lateral fn_reporte_sobres_detalle('${MES}'::date) t) x`)
  const igual = JSON.stringify(rows[0].j) === antes[uid]
  if (!igual) ok = false
  console.log(`   u${uid}: 15 columnas ${igual ? 'IDENTICAS' : 'DISTINTAS'}, cuentan_en_totales ${rows[0].cuentan}/${rows[0].total}`)
}
const acl2 = await q(`select coalesce(array_to_string(p.proacl,','),'(default)') a from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_reporte_sobres_detalle'`)
console.log('ACL despues:', acl2[0]?.a)
console.log(ok ? '\nVERIFICADO: nada se movio' : '\nFALLA: las columnas cambiaron')
