import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,300));return j}
const auth = (uid) => `(select set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=${uid}),'role','authenticated')::text,true) as _c) c`
const snap = (uid, mes) => `select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)::text j from (select * from ${auth(uid)} cross join lateral fn_reporte_sobres_detalle('${mes}'::date) t) t`
const saldo = async (uid, mes) => (await q(`select s::text s from ${auth(uid)} cross join lateral (select fn_obtener_saldo_a_asignar('${mes}'::date) s) t`))[0].s
const USERS = [1, 135, 136, 137, 198]
const grant = () => q(`grant execute on function public.fn_reporte_sobres_detalle(date) to authenticated`)

// A) estado del ciclo en curso, antes
const antes = {}
for (const u of USERS) antes[u] = (await q(snap(u, '2026-10-01')))[0].j
const saldoAntes = {}
for (const u of USERS) saldoAntes[u] = await saldo(u, '2026-10-01')

await q(fs.readFileSync('temp_sql/162_arrastre_base_cero.sql','utf8'))
await grant()
console.log('162 desplegado')

let ok = true
for (const u of USERS) {
  const d = (await q(snap(u, '2026-10-01')))[0].j
  const igual = d === antes[u]
  const s = await saldo(u, '2026-10-01')
  const saldoIgual = s === saldoAntes[u]
  if (!igual || !saldoIgual) ok = false
  console.log(`   u${u}: ciclo en curso ${igual ? 'IDENTICO' : 'CAMBIO'} | saldo ${saldoAntes[u]} -> ${s} ${saldoIgual ? '' : '(' + (s - saldoAntes[u]).toFixed(2) + ')'}`)
}
console.log(ok ? '\nCiclo en curso sin cambios: la activacion de u1 y u198 es de octubre y el ciclo anterior cerro antes.\n' : '\nOJO: el ciclo en curso cambio\n')

// B) el ciclo siguiente: ahi tiene que aparecer el arrastre
console.log('=== noviembre 2026 (el arrastre tiene que estar vivo) ===')
for (const u of [1, 198, 136]) {
  const r = await q(`select count(*) filter (where r.arrastre_mes_anterior <> 0) con_arrastre,
     round(sum(r.arrastre_mes_anterior),2) total_arrastre,
     round(sum(case when r.arrastre_mes_anterior > 0 then r.arrastre_mes_anterior else 0 end),2) positivos,
     round(sum(case when r.arrastre_mes_anterior < 0 then r.arrastre_mes_anterior else 0 end),2) negativos
     from ${auth(u)} cross join lateral fn_reporte_sobres_detalle('2026-11-01'::date) r`)
  const s = await saldo(u, '2026-11-01')
  console.log(`   u${u}: sobres con arrastre ${r[0].con_arrastre}, total ${r[0].total_arrastre} (positivos ${r[0].positivos}, negativos ${r[0].negativos}) | saldo a asignar ${s}`)
}
