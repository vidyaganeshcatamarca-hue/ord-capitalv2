import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();return {ok:r.ok, j}}
const conAuth = (call) => `
  select coalesce(json_agg(t),'[]'::json)::text as j from (
    select * from (select set_config('request.jwt.claims',
      json_build_object('sub',(select auth_id from usuarios where user_id=1),'role','authenticated')::text,true) as _c) c
    cross join lateral ${call} t) t`
const llamar = async (etiqueta, call) => {
  const {ok, j} = await q(conAuth(call))
  console.log(`${etiqueta.padEnd(34)} ${ok ? j[0].j.slice(0,210) : 'ERROR: ' + (j.message||'').slice(0,120)}`)
  return ok
}
console.log('=== ANTES')
await llamar('escudo(uuid del usuario 1)', "fn_reporte_escudo_tiempo((select auth_id from usuarios where user_id=1))")

const dep = await q(fs.readFileSync('temp_sql/148_escudo_uuid.sql','utf8'))
if (!dep.ok) throw new Error('deploy fallo: ' + JSON.stringify(dep.j).slice(0,300))
console.log('\n=== 148 desplegado. DESPUES')
const a = await llamar('escudo(uuid del usuario 1)', "fn_reporte_escudo_tiempo((select auth_id from usuarios where user_id=1))")
await llamar('escudo(uuid inventado)', "fn_reporte_escudo_tiempo('00000000-0000-0000-0000-000000000000'::uuid)")
await llamar('el overload vigente sigue igual', 'fn_reporte_escudo_tiempo()')
console.log(a ? '\nVERIFICADO' : '\nFALLA')
