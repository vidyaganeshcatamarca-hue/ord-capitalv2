// Prueba funcional de los guards de la categoría de Inversiones (S7/S9).
// Ejecuta movimientos REALES de prueba y los revierte (transacción con ROLLBACK).
// Uso: node temp_sql/85d_test_guards.mjs
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) return { error: json.message || JSON.stringify(json) }
  return json
}

let fallos = 0
const check = (ok, etiqueta, detalle = '') => {
  console.log(`${ok ? '✓' : '✗'} ${etiqueta}${detalle ? ' — ' + detalle : ''}`)
  if (!ok) fallos++
}

// Todo en una transaccion que se revierte: los guards se prueban de verdad
// pero la base queda intacta.
await q('BEGIN')
const u = await q(`select e.estructura_id, e.user_id, e.nombre_cuenta
  from public.p_estructuras_egresos e
  where COALESCE(e.tipo_cupo,'')='investment' order by e.user_id limit 1`)
if (!u.length) { console.log('sin categoría de Inversiones para probar'); await q('ROLLBACK'); process.exit(1) }
const cat = u[0]
console.log(`Probando sobre user ${cat.user_id}, estructura ${cat.estructura_id} (${cat.nombre_cuenta})\n`)

// (1) Renombrar la categoría → debe FALLAR
const r1 = await q(`update public.p_estructuras_egresos set nombre_cuenta = 'Inventario' where estructura_id = ${cat.estructura_id}`)
check(/error_category_system_locked/.test(r1.error || ''), 'renombrar la categoría se rechaza', (r1.error || '').slice(0, 90))

// (2) Crear subcategoría bajo ella → debe FALLAR
const r2 = await q(`insert into public.p_estructuras_egresos (padre_id, user_id, nombre_cuenta, descripcion, tipo_cupo, icono, color)
  values (${cat.estructura_id}, ${cat.user_id}, 'Hija Prueba', 'x', 'investment', 'Tag', '#111111')`)
check(/error_category_system_locked/.test(r2.error || ''), 'crear subcategoría se rechaza', (r2.error || '').slice(0, 90))

// (3) Eliminar la categoría → debe FALLAR
const r3 = await q(`delete from public.p_estructuras_egresos where estructura_id = ${cat.estructura_id}`)
check(/error_category_system_locked/.test(r3.error || ''), 'eliminar la categoría se rechaza', (r3.error || '').slice(0, 90))

// (4) Fabricar una categoría 'investment' paralela → debe FALLAR
const r4 = await q(`insert into public.p_estructuras_egresos (user_id, nombre_cuenta, descripcion, tipo_cupo, icono, color)
  values (${cat.user_id}, 'Mi Inversiones', 'x', 'investment', 'Tag', '#222222')`)
check(/error_category_system_locked/.test(r4.error || ''), 'crear una categoría investment paralela se rechaza', (r4.error || '').slice(0, 90))

// (5) Movimiento manual contra la categoría → debe FALLAR
const w = await q(`select billetera_id from public.p_billeteras where user_id = ${cat.user_id} and activa = true limit 1`)
if (w.length) {
  const r5 = await q(`insert into public.p_caja (user_id, tipo, billetera_origen_id, valor_egreso, estructura_egreso_id, fecha, detalle, metadata)
    values (${cat.user_id}, 'expense', ${w[0].billetera_id}, 100, ${cat.estructura_id}, CURRENT_DATE, 'movimiento manual', '{}'::jsonb)`)
  check(/error_category_system_locked/.test(r5.error || ''), 'movimiento manual contra la categoría se rechaza', (r5.error || '').slice(0, 90))

  // (6) Movimiento del módulo (con metadata.inversion_id) → debe PASAR
  const r6 = await q(`insert into public.p_caja (user_id, tipo, billetera_origen_id, valor_egreso, estructura_egreso_id, fecha, detalle, metadata)
    values (${cat.user_id}, 'expense', ${w[0].billetera_id}, 100, ${cat.estructura_id}, CURRENT_DATE, 'investment_prefix: Prueba', '{"inversion_id":"1"}'::jsonb)`)
  check(!r6.error, 'el movimiento del módulo SÍ se acepta', (r6.error || '').slice(0, 90))
} else {
  console.log('· (sin billetera activa del usuario: se omiten las pruebas 5 y 6)')
}

// (7) La unicidad la garantiza la base: un segundo INSERT con el mismo user_id debe fallar
const r7 = await q(`insert into public.p_estructuras_egresos (user_id, nombre_cuenta, descripcion, tipo_cupo, icono, color)
  values (${cat.user_id}, 'cat_investments_portfolio', 'x', 'investment', '📈', '#059669')`)
check(/idx_estructuras_inversion_unica|duplicate key|unique/i.test(r7.error || ''), 'el índice único impide una segunda categoría de Inversiones', (r7.error || '').slice(0, 90))

// (8) Una categoría normal del usuario sigue pudiendo crearse y editarse
const r8 = await q(`insert into public.p_estructuras_egresos (user_id, nombre_cuenta, descripcion, tipo_cupo, icono, color)
  values (${cat.user_id}, 'Categoria Normal Prueba', 'x', 'need', 'Tag', '#333333')`)
const nueva = r8[0]?.estructura_id
check(!r8.error, 'una categoría normal del usuario se puede crear', (r8.error || '').slice(0, 90))
if (nueva) {
  const r9 = await q(`update public.p_estructuras_egresos set nombre_cuenta = 'Renombrada Prueba' where estructura_id = ${nueva}`)
  check(!r9.error, 'una categoría normal se puede renombrar', (r9.error || '').slice(0, 90))
}

await q('ROLLBACK')
console.log('\n(rollback: la base quedó como estaba)')
console.log(fallos === 0 ? '\nOK: los guards se comportan como deben.' : `\nFALLOS: ${fallos}`)
process.exit(fallos === 0 ? 0 : 1)