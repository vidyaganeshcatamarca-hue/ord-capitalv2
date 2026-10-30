// Deja operativa la cuenta de testing 198: sus 6 sobres sumaban 1.000.199 contra
// 2.109,91 de liquidez real. Se ponen en 0 y el usuario reparte desde cero.
import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,400));return j}

const antes = await q(`select u.user_id, u.nombre, r.moneda_default,
  (select count(*) from p_presupuestos p where p.user_id=u.user_id and p.mes_periodo=date_trunc('month',CURRENT_DATE)::date) as sobres,
  (select round(sum(p.monto_limite),2) from p_presupuestos p where p.user_id=u.user_id and p.mes_periodo=date_trunc('month',CURRENT_DATE)::date) as asignado
  from usuarios u left join p_config_region r on r.user_id=u.user_id where u.user_id=198`)
console.log('antes: ', JSON.stringify(antes[0]))

await q(`UPDATE p_presupuestos SET monto_limite = 0
  WHERE user_id = 198 AND mes_periodo = date_trunc('month', CURRENT_DATE)::date`)

const despues = await q(`select count(*) as sobres, round(coalesce(sum(monto_limite),0),2) as asignado,
  round(max(monto_limite),2) as mayor from p_presupuestos
  where user_id=198 and mes_periodo=date_trunc('month',CURRENT_DATE)::date`)
console.log('despues:', JSON.stringify(despues[0]))

const saldo = await q(`
  select coalesce(json_agg(t),'[]'::json)::text as j from (
    select * from (select set_config('request.jwt.claims',
      json_build_object('sub',(select auth_id from usuarios where user_id=198),'role','authenticated')::text,true) as _c) c
    cross join lateral (select public.fn_obtener_saldo_a_asignar(date_trunc('month',CURRENT_DATE)::date) as saldo) t) t`)
console.log('saldo a asignar del 198:', saldo[0].j)
