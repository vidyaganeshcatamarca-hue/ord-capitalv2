// 133_deploy_132.mjs — despliega temp_sql/132_base_cero_sin_arrastre.sql
//
//   node temp_sql/133_deploy_132.mjs
//
// Que verifica:
//   1. ANTES: el reporte y el disponible REALES (llamando las funciones como cada
//      usuario, con request.jwt.claims + CROSS JOIN LATERAL) para:
//        - user 1   → base cero con activación el 2026-10-27 (el caso del dueño)
//        - user 136 → base cero SIN fecha de activación (usuarios viejos)
//        - user 174, 206, 207 → modo anticipado: control de regresión, no pueden
//          cambiar ni un peso.
//   2. Aplica la función nueva.
//   3. DESPUÉS:
//        - user 1: arrastre 0, gastado solo desde el 27/10 (0 movimientos), y el
//          disponible tiene que subir hasta la liquidez real (2.627.275).
//        - user 136: arrastre 0 y todo lo demás igual (sin fecha no se inventa corte).
//        - anticipados: snapshot idéntico al de antes.
//        - ninguna fila de las tablas del presupuesto cambia.
//   4. Si algo falla, restaura la función anterior y aborta.

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
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 900))
  return json
}

/**
 * Impersona al usuario y devuelve su reporte + disponible. El `set_config` va en
 * un FROM con LATERAL: en la misma lista de SELECT el planificador puede evaluar
 * la función antes que el claim y auth.uid() vuelve NULL (pasó al preparar esto).
 */
const snapshot = async (userId) => {
  const rows = await q(`
    select coalesce(sum(r.monto_disponible), 0) as todos,
           coalesce(sum(greatest(r.monto_disponible, 0)), 0) as positivos,
           coalesce(sum(r.arrastre_mes_anterior), 0) as arrastre,
           coalesce(sum(r.monto_gastado), 0) as gastado,
           coalesce(sum(r.monto_asignado), 0) as asignado,
           count(*) as sobres,
           (select public.fn_obtener_saldo_a_asignar(date_trunc('month', CURRENT_DATE)::date)
              from (select set_config('request.jwt.claims',
                     json_build_object('sub', (select auth_id from usuarios where user_id = ${userId}), 'role','authenticated')::text, true) as c) cl) as disponible
    from (select set_config('request.jwt.claims',
            json_build_object('sub', (select auth_id from usuarios where user_id = ${userId}), 'role','authenticated')::text, true) as c) claim
    cross join lateral public.fn_reporte_sobres_detalle(date_trunc('month', CURRENT_DATE)::date) r`)
  const r = rows[0]
  return {
    todos: Number(r.todos),
    positivos: Number(r.positivos),
    arrastre: Number(r.arrastre),
    gastado: Number(r.gastado),
    asignado: Number(r.asignado),
    sobres: Number(r.sobres),
    disponible: Number(r.disponible),
  }
}

const huella = async () => {
  const rows = await q(`
    select (select count(*) from p_presupuestos) as p_presupuestos,
           (select coalesce(sum(monto_limite), 0) from p_presupuestos) as monto_total,
           (select count(*) from p_caja) as caja,
           (select coalesce(sum(valor_egreso), 0) from p_caja) as caja_total,
           (select count(*) from p_estructuras_egresos) as estructuras`)
  return rows[0]
}

const definicion = async () => (
  await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'fn_reporte_sobres_detalle'`)
)[0].def

const fmt = (n) => Number(n).toLocaleString('es-AR')
const terminar = (def) => (/;\s*$/.test(def) ? def : def + ';')

/** Base cero con activación (caso del dueño), base cero sin fecha, y controles. */
const CON_ACTIVACION = 1
const SIN_FECHA = 136
const CONTROLES = [174, 206, 207]

const anterior = terminar(await definicion())
const yaDesplegada = /v_arrastre_cero/.test(anterior)

console.log('=== ANTES ===')
const antes = {}
for (const userId of [CON_ACTIVACION, SIN_FECHA, ...CONTROLES]) {
  antes[userId] = await snapshot(userId)
  console.log(`user ${userId}: ${JSON.stringify(antes[userId])}`)
}
const liquidez = Number(
  (await q(`select (select coalesce(sum(saldo_actual),0) from p_billeteras
                     where user_id = ${CON_ACTIVACION} and activa = true and es_fondo_prevision = false
                       and moneda = fn_get_default_currency(${CON_ACTIVACION})) as v`))[0].v,
)
console.log(`liquidez real del user ${CON_ACTIVACION}: ${fmt(liquidez)}`)
const huellaAntes = await huella()
console.log(`huella: ${JSON.stringify(huellaAntes)}`)

if (!yaDesplegada) {
  // pg_get_functiondef no cierra con ';': el artefacto sí, y el guard lo cubre igual.
  const sql = terminar(fs.readFileSync('temp_sql/132_base_cero_sin_arrastre.sql', 'utf8'))
  const aplicado = await q(`BEGIN;\n${sql}\nCOMMIT;`)
  if (aplicado?.message) {
    console.error('✗ el deploy falló: ' + aplicado.message)
    process.exit(1)
  }
  console.log('\nSQL aplicado.')
} else {
  console.log('\nLa función nueva ya está desplegada: se valida sin re-aplicar.')
}

console.log('\n=== DESPUÉS ===')
const despues = {}
for (const userId of [CON_ACTIVACION, SIN_FECHA, ...CONTROLES]) {
  despues[userId] = await snapshot(userId)
  console.log(`user ${userId}: ${JSON.stringify(despues[userId])}`)
}
const huellaDespues = await huella()
console.log(`huella: ${JSON.stringify(huellaDespues)}`)

const errores = []
const u1 = despues[CON_ACTIVACION]
const u1Antes = antes[CON_ACTIVACION]

if (u1.arrastre !== 0) {
  errores.push(`user ${CON_ACTIVACION}: el arrastre sigue en ${fmt(u1.arrastre)}`)
}
if (u1.gastado !== 0) {
  errores.push(`user ${CON_ACTIVACION}: se siguen contando ${fmt(u1.gastado)} de gasto anterior a la activación`)
}
if (Math.abs(u1.disponible - liquidez) > 0.5) {
  errores.push(`user ${CON_ACTIVACION}: el disponible (${fmt(u1.disponible)}) no llegó a la liquidez (${fmt(liquidez)})`)
}
if (!(u1.disponible > u1Antes.disponible)) {
  errores.push(`user ${CON_ACTIVACION}: el disponible no subió (${fmt(u1Antes.disponible)} -> ${fmt(u1.disponible)})`)
}

// Sin fecha de activación no se inventa corte: se apaga el arrastre y nada más.
const conFecha = despues[SIN_FECHA]
const conFechaAntes = antes[SIN_FECHA]
if (conFecha.arrastre !== 0) {
  errores.push(`user ${SIN_FECHA}: el arrastre quedó en ${fmt(conFecha.arrastre)}`)
}
for (const campo of ['gastado', 'asignado', 'positivos', 'sobres', 'disponible']) {
  if (Math.abs(conFecha[campo] - conFechaAntes[campo]) > 0.5) {
    errores.push(`user ${SIN_FECHA}: ${campo} cambió sin fecha de activación (${fmt(conFechaAntes[campo])} -> ${fmt(conFecha[campo])})`)
  }
}

// Los usuarios en modo anticipado no pueden moverse ni un peso.
for (const userId of CONTROLES) {
  const a = JSON.stringify(antes[userId])
  const d = JSON.stringify(despues[userId])
  if (a !== d) errores.push(`user ${userId} (anticipado) cambió: ${a} -> ${d}`)
}

if (JSON.stringify(huellaAntes) !== JSON.stringify(huellaDespues)) {
  errores.push(`cambió la huella de las tablas: ${JSON.stringify(huellaAntes)} -> ${JSON.stringify(huellaDespues)}`)
}

if (errores.length) {
  console.error('\n✗ POSTCHECK FALLÓ — revierto la función al estado anterior')
  for (const e of errores) console.error('  - ' + e)
  if (!yaDesplegada) {
    const revertido = await q(`BEGIN;\n${anterior}\nCOMMIT;`)
    console.error(revertido?.message ? '✗✗ NO SE PUDO REVERTIR: ' + revertido.message : '✓ función anterior restaurada')
  }
  process.exit(1)
}

console.log('\n✓ base cero sin arrastre: el arrastre del user ' + CON_ACTIVACION + ' pasó de ' + fmt(u1Antes.arrastre) + ' a 0')
console.log(`✓ el gasto previo a la activación ya no cuenta: ${fmt(u1Antes.gastado)} -> 0`)
console.log(`✓ el disponible subió de ${fmt(u1Antes.disponible)} a ${fmt(u1.disponible)} (= liquidez real)`)
console.log(`✓ user ${SIN_FECHA} (base cero sin fecha): arrastre 0, el resto intacto`)
console.log(`✓ anticipados intactos: ${CONTROLES.join(', ')}`)
console.log('✓ ninguna fila del presupuesto cambió: es el reporte, no una migración')
