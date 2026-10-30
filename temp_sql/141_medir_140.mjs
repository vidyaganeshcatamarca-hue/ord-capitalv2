// Mide las 10 funciones del grupo A con el usuario 1. Uso: node temp_sql/141_medir_140.mjs antes|despues
import fs from 'node:fs'
const env={};for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2]}
const REF=env.SUPABASE_URL.replace('https://','').split('.')[0]
const q=async(g)=>{const r=await fetch('https://api.supabase.com/v1/projects/'+REF+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+env.ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:g})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,400));return j}
const etiqueta = process.argv[2] || 'antes'
const U = "(select auth_id from usuarios where user_id=1)::text"

const CALLS = [
  ['saldo_disponible_para_asignar', `fn_obtener_saldo_disponible_para_asignar('2026-09-30'::date)`],
  ['techo_presupuestario', 'fn_obtener_techo_presupuestario()'],
  ['escudo_tiempo', 'fn_reporte_escudo_tiempo()'],
  ['escudo_tiempo(uuid)', `fn_reporte_escudo_tiempo((select auth_id from usuarios where user_id=1))`],
  ['evolucion_presupuesto', 'fn_reporte_evolucion_presupuesto()'],
  ['limite_seguro_deuda', 'fn_reporte_limite_seguro_deuda()'],
  ['proyeccion_presupuestaria', 'fn_reporte_proyeccion_presupuestaria()'],
  ['gasto_por_integrante', 'fn_reporte_gasto_por_integrante()'],
  ['punto_equilibrio', 'fn_reporte_punto_equilibrio()'],
  ['top_fuentes_ingreso', `fn_reporte_top_fuentes_ingreso(NULL::text)`]
]
const out = {}
for (const [nombre, call] of CALLS) {
  try {
    const rows = await q(`select coalesce(json_agg(t),'[]'::json)::text as j from (
      select * from (select set_config('request.jwt.claims', json_build_object('sub',${U},'role','authenticated')::text, true) as _c) c
      cross join lateral ${call} t) t`)
    out[nombre] = rows[0].j
  } catch (e) { out[nombre] = 'ERROR: ' + String(e.message).slice(0,140) }
}
fs.writeFileSync(`scratch/medicion-${etiqueta}.json`, JSON.stringify(out, null, 1))
for (const [k,v] of Object.entries(out)) console.log(`${k.padEnd(32)} ${String(v).slice(0,150)}`)
