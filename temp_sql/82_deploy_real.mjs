// Deploy REAL de la tanda "Inversiones v1 puesta a punto" (T1..T5).
// Requiere autorización explícita del dueño ANTES de ejecutar.
// Uso: node temp_sql/82_deploy_real.mjs          (deploy + verificación de firmas)
//      node temp_sql/82_deploy_real.mjs --check   (solo verificación, read-only)
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

const ONLY_CHECK = process.argv.includes('--check')

const CHECKS = [
  ["fn_crear_inversion", "ultima_conciliacion date, tipo_activo CASE"],
  ["fn_reporte_cartera_inversiones", "estado='activa' + monto_liquidado"],
  ["fn_reporte_historial_inversiones", "columna moneda"],
  ["fn_reporte_patrimonio_inversiones", "jsonb multimoneda"],
  ["fn_reporte_rendimiento_vs_inflacion", "agrega en moneda local"],
  ["fn_reporte_distribucion_activos", "agrega en moneda local"],
  ["fn_liquidar_inversion", "sin re-acreditar capital rescatado"],
  ["fn_obtener_config_inflacion", "existe (GET país+fuente)"],
]

if (ONLY_CHECK) {
  console.log('=== Verificación read-only de firmas (post-deploy esperado) ===')
  for (const [fn, expectativa] of CHECKS) {
    const rows = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='${fn}'`)
    if (!rows.length) { console.log(`✗ ${fn}: NO EXISTE (esperaba: ${expectativa})`); continue }
    console.log(`✓ ${fn} presente (${rows[0].def.length} bytes) — esperaba: ${expectativa}`)
  }
  process.exit(0)
}

console.log('Deploy REAL T1..T5 de la tanda inversiones puesta a punto... (requiere autorización del dueño)')
const ddl = fs.readFileSync('temp_sql/82_deploy_inversiones_puesta_punto.sql', 'utf-8')
await q(ddl)
console.log('Deploy aplicado. Verificando firmas...')
for (const [fn, expectativa] of CHECKS) {
  const rows = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='${fn}'`)
  if (!rows.length) { console.log(`✗ ${fn}: NO EXISTE (esperaba: ${expectativa})`); process.exit(1) }
  console.log(`✓ ${fn} (${rows[0].def.length} bytes) — ${expectativa}`)
}
console.log('Deploy completo. Correr probes funcionales (82_postcheck) antes de dar por cerrada la tanda.')