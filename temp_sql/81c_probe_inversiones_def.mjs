// Diagnóstico READ-ONLY parte 3: definiciones de las RPC de inversiones + cron + tablas activos.
// Uso: node temp_sql/81c_probe_inversiones_def.mjs
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 800))
  return json
}

const FN = [
  'fn_crear_inversion',
  'fn_actualizar_valor_inversion',
  'fn_liquidar_inversion',
  'fn_rescatar_inversion',
  'fn_reporte_cartera_inversiones',
  'fn_reporte_patrimonio_inversiones',
  'fn_reporte_rendimiento_vs_inflacion',
  'fn_reporte_detalle_inversion',
  'fn_reporte_historial_inversiones',
  'fn_reporte_distribucion_activos',
  'fn_configurar_inflacion',
  'fn_calcular_rendimiento_plazo_fijo',
  'fn_calcular_inflacion_mensual',
  'fn_reporte_estado_inversiones',
]

for (const name of FN) {
  const rows = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='${name}'`)
  if (!rows.length) { console.log(`### ${name}: (NO EXISTE)\n`); continue }
  console.log(`### ${name}\n`)
  console.log(rows[0].def)
  console.log('')
}

console.log('=== Cron jobs (pg_cron) ===')
try {
  const jobs = await q(`select jobid, jobname, schedule, command, active from cron.job order by jobid`)
  if (jobs.length === 0) console.log('(sin jobs)')
  for (const j of jobs) console.log(`- #${j.jobid} [${j.active ? 'activo' : 'inactivo'}] ${j.jobname} (${j.schedule}): ${String(j.command).slice(0, 120)}`)
} catch (e) {
  console.log('(pg_cron no disponible: ' + String(e.message).slice(0, 150) + ')')
}

console.log('\n=== Tablas p_activos / tipos ===')
const tabs = await q(`select table_name from information_schema.tables
  where table_schema='public' and (table_name ~* 'activo|tipo' ) order by table_name`)
for (const t of tabs) console.log(`- ${t.table_name}`)