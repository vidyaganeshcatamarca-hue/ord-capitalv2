import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});if(!r.ok) throw new Error(JSON.stringify(await r.json()).slice(0,300));return r.json()}
const MES='2026-10-01'
const auth = (uid) => `(select set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=${uid}),'role','authenticated')::text,true) as _c) c`
const saldo = async (uid) => (await q(`select s::text s from ${auth(uid)} cross join lateral (select fn_obtener_saldo_a_asignar('${MES}'::date) s) t`))[0].s
const resumen = async (uid) => (await q(`select count(*) n,
    count(*) filter (where r.es_padre) padres,
    count(*) filter (where r.es_padre and coalesce(r.monto_asignado,0) > 0) padres_con_presupuesto,
    count(*) filter (where not r.cuenta_en_totales) hijos_que_no_cuentan
   from ${auth(uid)} cross join lateral fn_reporte_sobres_detalle('${MES}'::date) r`))[0]
// las filas que NO son padre, como conjunto, no tienen que cambiar
const noPadres = async (uid) => (await q(`select coalesce(jsonb_agg(to_jsonb(r) order by r.estructura_id),'[]'::jsonb)::text j
   from ${auth(uid)} cross join lateral fn_reporte_sobres_detalle('${MES}'::date) r where not r.es_padre`))[0].j

const USERS=[1,198]
const antes = {}
for (const u of USERS) antes[u] = { resumen: await resumen(u), saldo: await saldo(u), noPadres: await noPadres(u) }
console.log('antes:', USERS.map(u=>`u${u} ${antes[u].resumen.n} filas (${antes[u].resumen.padres} padres) saldo ${antes[u].saldo}`).join(' | '))

await q(fs.readFileSync('temp_sql/167_padre_siempre_visible.sql','utf8'))
await q(`grant execute on function public.fn_reporte_sobres_detalle(date) to authenticated`)
console.log('\n167 desplegado')
for (const u of USERS) {
  const r = await resumen(u), s = await saldo(u), np = await noPadres(u)
  console.log(`   u${u}: ${r.n} filas (${r.padres} padres, ${r.padres_con_presupuesto} con presupuesto, ${r.hijos_que_no_cuentan} hijos que no cuentan) | saldo ${antes[u].saldo} -> ${s} ${s===antes[u].saldo?'(igual)':'(CAMBIO)'} | filas no-padre ${np===antes[u].noPadres?'IDENTICAS':'CAMBIARON'}`)
}
