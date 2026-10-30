import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,500));return j}
const sql = fs.readFileSync('temp_sql/140_reportes_restantes.sql','utf8')
await q(sql)
const v = await q(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and position('v_p_caja_reportable' in p.prosrc)>0`)
console.log('funciones que leen la vista ahora:', v[0].n)
const suma = await q(`select round(sum(saldo_actual),2) as s from p_billeteras where user_id=1`)
console.log('saldo total de billeteras:', suma[0].s)
