import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,300));return j}
const MES = '2026-10-01'
const auth = `(select set_config('request.jwt.claims', json_build_object('sub',(select auth_id from usuarios where user_id=1),'role','authenticated')::text,true) as _c) c`
const lla = (expr) => `select coalesce(jsonb_agg(to_jsonb(t) order by 1),'[]'::jsonb)::text as j from (select * from ${auth} cross join lateral ${expr} t) t`
const CONSULTAS = {
  saldo_disponible: `fn_obtener_saldo_disponible_para_asignar('${MES}'::date)`,
  proyeccion:       `fn_reporte_proyeccion_presupuestaria()`,
  termometro:       `fn_reporte_termometro_presupuestos('${MES}'::date)`,
  saldo_a_asignar:  `fn_obtener_saldo_a_asignar('${MES}'::date)`,
}
const medir = async () => {
  const r = {}
  for (const [k, expr] of Object.entries(CONSULTAS)) {
    try { const j = await q(lla(expr)); r[k] = j[0].j } catch (e) { r[k] = 'ERROR: ' + e.message.slice(0, 120) }
  }
  try {
    const t = await q(`select jsonb_build_object('user_id',1,'assigned',assigned)::text j from user_metrics where user_id=1`)
    r.telemetria = t[0]?.j ?? 'sin fila previa'
  } catch { r.telemetria = '(tabla no consultable)' }
  return r
}
const antes = await medir()
await q(fs.readFileSync('temp_sql/153_sumas_sin_padres.sql','utf8'))
console.log('153 desplegado\n')
const despues = await medir()

let ok = true
for (const k of Object.keys(CONSULTAS)) {
  const igual = antes[k] === despues[k]
  if (!igual) ok = false
  console.log(`   ${k.padEnd(18)} ${igual ? 'IDENTICO' : 'DISTINTO'}  ${despues[k].slice(0, 110)}`)
}
console.log(ok ? '\nVERIFICADO: las cinco sumas no se movieron' : '\nFALLA: alguna suma cambio')
