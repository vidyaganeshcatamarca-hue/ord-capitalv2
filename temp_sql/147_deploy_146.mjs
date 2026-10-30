import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();return {ok:r.ok, j}}
const llamar = async (etiqueta, call) => {
  const {ok, j} = await q(`
    select coalesce(json_agg(t),'[]'::json)::text as j from (
      select * from (select set_config('request.jwt.claims',
        json_build_object('sub',(select auth_id from usuarios where user_id=1),'role','authenticated')::text,true) as _c) c
      cross join lateral ${call} t) t`)
  const txt = ok ? j[0].j : ('ERROR: ' + (j.message||'').slice(0,130))
  console.log(`${etiqueta.padEnd(44)} ${txt.slice(0,160)}`)
  return ok
}
console.log('=== ANTES')
await llamar('saldo_disponible_para_asignar(2026-10-01)', "fn_obtener_saldo_disponible_para_asignar('2026-10-01'::date)")
await llamar('evolucion_presupuesto()', 'fn_reporte_evolucion_presupuesto()')

const dep = await q(fs.readFileSync('temp_sql/146_dos_rpc_rotas.sql','utf8'))
if (!dep.ok) throw new Error('deploy fallo: ' + JSON.stringify(dep.j).slice(0,300))
console.log('\n=== 146 desplegado. DESPUES')
const a = await llamar('saldo_disponible_para_asignar(2026-10-01)', "fn_obtener_saldo_disponible_para_asignar('2026-10-01'::date)")
const b = await llamar('evolucion_presupuesto()', 'fn_reporte_evolucion_presupuesto()')
console.log(a && b ? '\nVERIFICADO: las dos devuelven datos' : '\nFALLA: alguna sigue rota')
