// Post-chequeo read-only: estado vivo, sin residuos del test, y set real del tester.
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m=l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]]=m[2] }
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => {
  const r = await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})
  const j = await r.json(); if(!r.ok) throw new Error(JSON.stringify(j).slice(0,700)); return j
}
const [flags] = await q(`select count(*) filas, count(*) filter (where activo_testing is distinct from activo) divergentes,
  count(*) filter (where activo) activas, count(*) filter (where activo_testing) activas_testing from app_feature_flags`)
const config = await q(`select clave, valor from app_global_config where clave like 'modo_avanzado%' order by clave`)
const modes = await q(`select modo_app, count(*) n from usuarios group by 1 order by 1`)
const [tester] = await q(`select u.auth_id::text auth_id, u.email
  from usuarios u join app_global_config g on g.clave='modo_avanzado_testing_users'
  where u.email = any (string_to_array(regexp_replace(g.valor,'\s+','','g'),',')) order by u.user_id limit 1`)
const payload = await q(`begin; set local request.jwt.claims='{"sub":"${tester.auth_id}"}'; select public.fn_obtener_modo_app(); rollback;`)
const [residue] = await q(`select
  (select count(*) from pg_class where relpersistence = 't') as temp_tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fn\_run\_%') as runner_fns`)
console.log(JSON.stringify({flags, config, modes, tester: tester.email, payload: payload[0].fn_obtener_modo_app, residue}, null, 1))
