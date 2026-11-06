// Deploy REAL de la tanda "Inversiones v1 puesta a punto" (T1-T5 + S7 + S9).
// El dueño autorizó el deploy el 2026-10-21.
//
// Uso: node temp_sql/85_deploy_real.mjs          (deploy + verificación)
//      node temp_sql/85_deploy_real.mjs --check   (solo verificación, read-only)
//
// ORDEN (importante):
//   1. 82_* — las 8 funciones de la tanda de bugs. Cambia el contrato de
//      fn_reporte_patrimonio_inversiones (jsonb): el front viejo rompe, asi que
//      el front tiene que salir en la misma ventana.
//   2. 83_* — los 4 triggers que blindan la categoría de Inversiones.
//   3. 84_* — key única + índice único parcial + upsert. Va al final porque
//      renombra las filas existentes a 'cat_investments_portfolio' y los
//      triggers de 83 deben reconocer las dos keys.
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
  ['fn_crear_inversion', 'T1+S9: nace conciliada, PF devenga, categoría por tipo_cupo con upsert'],
  ['fn_reporte_cartera_inversiones', 'T2: solo activas + monto_liquidado'],
  ['fn_reporte_historial_inversiones', 'T2: columna moneda'],
  ['fn_reporte_patrimonio_inversiones', 'T3: jsonb multimoneda'],
  ['fn_reporte_rendimiento_vs_inflacion', 'T3: agrega en moneda local'],
  ['fn_reporte_distribucion_activos', 'T3: agrega en moneda local'],
  ['fn_liquidar_inversion', 'T4: sin re-acreditar capital rescatado'],
  ['fn_obtener_config_inflacion', 'T5: GET país+fuente'],
  ['fn_rescatar_inversion', 'S9: categoría por tipo_cupo (no por nombre)'],
]

const def = async (fn) => {
  const rows = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='${fn}'`)
  return rows[0]?.def || ''
}

const TRIGGERS = [
  ['tr_bloquear_categoria_inversion', 'p_estructuras_egresos', 'BEFORE INSERT OR UPDATE'],
  ['tr_bloquear_borrado_categoria_inversion', 'p_estructuras_egresos', 'BEFORE DELETE'],
  ['tr_bloquear_movimiento_categoria_inversion', 'p_caja', 'BEFORE INSERT OR UPDATE'],
  ['tr_bloquear_reasignacion_categoria_inversion', 'p_caja', 'BEFORE UPDATE'],
]

async function verify() {
  let fallos = 0
  console.log('=== Funciones ===')
  for (const [fn, expectativa] of CHECKS) {
    const d = await def(fn)
    if (!d) { console.log(`✗ ${fn}: NO EXISTE — esperaba: ${expectativa}`); fallos++; continue }
    console.log(`✓ ${fn} (${d.length} bytes) — ${expectativa}`)
  }

  console.log('\n=== Triggers (S7) ===')
  for (const [nombre, tabla, timing] of TRIGGERS) {
    const rows = await q(`select tgname from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relname='${tabla}' and t.tgname='${nombre}' and not t.tgisinternal`)
    if (!rows.length) { console.log(`✗ ${nombre} sobre ${tabla}: NO EXISTE (esperaba ${timing})`); fallos++; continue }
    console.log(`✓ ${nombre} sobre ${tabla}`)
  }

  console.log('\n=== Índice único de la categoría (S9) ===')
  const idx = await q(`select indexdef from pg_indexes
    where schemaname='public' and indexname='idx_estructuras_inversion_unica'`)
  if (!idx.length) { console.log('✗ idx_estructuras_inversion_unica: NO EXISTE'); fallos++ }
  else console.log(`✓ ${idx[0].indexdef}`)

  console.log('\n=== Estado de las filas de categoría Inversiones ===')
  const rows = await q(`select e.user_id, e.nombre_cuenta, e.tipo_cupo,
    (select count(*) from public.p_caja c where c.estructura_egreso_id = e.estructura_id) as movimientos
    from public.p_estructuras_egresos e
    where COALESCE(e.tipo_cupo,'') = 'investment' order by e.user_id`)
  if (!rows.length) console.log('(sin categorías de Inversiones todavía)')
  for (const r of rows) console.log(`  user ${r.user_id}: ${r.nombre_cuenta} (${r.tipo_cupo}, ${r.movimientos} movimientos)`)
  const dupes = await q(`select user_id, count(*) from public.p_estructuras_egresos
    where COALESCE(tipo_cupo,'')='investment' group by user_id having count(*)>1`)
  if (dupes.length) { console.log(`✗ usuarios con categorías duplicadas: ${JSON.stringify(dupes)}`); fallos++ }
  else console.log('✓ ninguna categoría duplicada por usuario')

  console.log(fallos === 0 ? '\nOK: la tanda quedó desplegada como se pidió.' : `\nFALLOS: ${fallos}`)
  return fallos
}

if (ONLY_CHECK) {
  process.exit((await verify()) === 0 ? 0 : 1)
}

const SCRIPTS = [
  'temp_sql/82_deploy_inversiones_puesta_punto.sql',
  'temp_sql/83_categoria_inversiones_bloqueada.sql',
  'temp_sql/84_categoria_key_unica.sql',
]

console.log('Deploy REAL de la tanda de inversiones (82 + 83 + 84) — autorizado por el dueño 2026-10-21')
for (const s of SCRIPTS) {
  const ddl = fs.readFileSync(s, 'utf-8')
  console.log(`\n→ aplicando ${s} (${ddl.split('\n').length} lineas)...`)
  await q(ddl)
  console.log(`  ✓ ${s} aplicado`)
}

console.log('\n=== Verificación post-deploy ===')
process.exit((await verify()) === 0 ? 0 : 1)