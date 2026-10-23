// READ-ONLY: verifica que el Management API permite BEGIN + SET LOCAL claims + ROLLBACK
// y que auth.uid() lo respeta (mismo truco que usará el test transaccional).
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://','').split('.')[0]
const q = async (query) => {
  const r = await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query', {
    method:'POST', headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},
    body: JSON.stringify({query})})
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0,600)); return j
}
const u = await q(`select auth_id::text auth_id, email, modo_app from usuarios where email is not null order by user_id limit 2`)
console.log('usuarios muestra:', JSON.stringify(u))
const authId = u[0].auth_id
const res = await q(`begin;
set local request.jwt.claims = '{"sub":"${authId}"}';
select auth.uid()::text as uid;
select public.fn_obtener_modo_app() as payload;
rollback;`)
console.log(JSON.stringify(res).slice(0,1200))
