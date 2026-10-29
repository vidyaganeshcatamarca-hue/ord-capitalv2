// 131_deploy_130.mjs — despliega temp_sql/130_saldo_deficit_no_suma.sql
//
//   node temp_sql/131_deploy_130.mjs
//
// Que verifica, en este orden:
//   1. ANTES: el RPC real, llamado como el user 1 (impersonando
//      request.jwt.claims, que es de donde auth.uid() saca el sub), y los
//      terminos que lo componen leidos de las funciones REALES:
//      liquidez de billeteras, SUM(monto_disponible) y SUM(GREATEST(...,0) de
//      fn_reporte_sobres_detalle, y cuotas de tarjeta.
//      No se replica ninguna formula a mano: una replica se desincroniza (el
//      reporte, por ejemplo, suma filas del hogar) y el postcheck mentiria.
//   2. Aplica la funcion nueva.
//   3. DESPUÉS: el RPC tiene que devolver exactamente
//      liquidez - sobres positivos - cuotas, y la diferencia contra el valor
//      anterior tiene que ser exactamente el monto de sobres en rojo que antes
//      se sumaba. Ademas NINGUNA fila de las tablas del presupuesto cambia.
//   4. Si algo falla, se vuelve a poner la funcion anterior y se aborta.
//
// Uso seguro: el script no toca datos, solo el cuerpo de la funcion.

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

const IMPERSONAR = `select set_config('request.jwt.claims',
  json_build_object('sub', (select auth_id from usuarios where user_id = 1), 'role', 'authenticated')::text, true) as claims;`

/** El RPC real como lo ve el user 1. */
const rpc = async () => {
  const rows = await q(`
    select set_config('request.jwt.claims',
      json_build_object('sub', (select auth_id from usuarios where user_id = 1), 'role', 'authenticated')::text, true) as claims,
      public.fn_obtener_saldo_a_asignar(date_trunc('month', CURRENT_DATE)::date) as disponible`)
  return Number(rows[0].disponible)
}

/** Los terminos de la fórmula, leidos de las funciones reales. */
const terminos = async () => {
  const rows = await q(`
    ${IMPERSONAR}
    with sobres as (
      select coalesce(sum(monto_disponible), 0) as todos,
             coalesce(sum(greatest(monto_disponible, 0)), 0) as positivos
      from public.fn_reporte_sobres_detalle(date_trunc('month', CURRENT_DATE)::date)
    ), ciclo as (
      select (date_trunc('month', CURRENT_DATE) + ((c.dia_ancla_ciclo - 1) * interval '1 day'))::date as ini
      from p_presupuestos_config c where c.user_id = 1
    )
    select (select coalesce(sum(saldo_actual), 0) from p_billeteras
            where user_id = 1 and activa = true and es_fondo_prevision = false
              and moneda = fn_get_default_currency(1)) as liquidez,
           sobres.todos, sobres.positivos,
           (select coalesce(sum(monto_cuota), 0) from p_cuotas_detalle
            where user_id = 1 and pagado = false
              and fecha_estimada_pago <= (select ini + interval '1 month' - interval '1 day' from ciclo)) as tarjetas
    from sobres`)
  const r = rows[0]
  return {
    liquidez: Number(r.liquidez),
    todos: Number(r.todos),
    positivos: Number(r.positivos),
    negativos: Number(r.todos) - Number(r.positivos),
    tarjetas: Number(r.tarjetas),
  }
}

/** Huella de las tablas del presupuesto: la tanda 1 no puede tocar ninguna. */
const huella = async () => {
  const rows = await q(`
    select (select count(*) from p_presupuestos) as p_presupuestos,
           (select coalesce(sum(monto_limite), 0) from p_presupuestos) as monto_total,
           (select count(*) from p_presupuestos_config) as config,
           (select count(*) from p_caja) as caja,
           (select count(*) from p_estructuras_egresos) as estructuras`)
  return rows[0]
}

const fmt = (n) => Number(n).toLocaleString('es-AR')
const cerca = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.5

// pg_get_functiondef devuelve el CREATE sin ';' final: sin esto la reversión
// fallaba con "syntax error at or near COMMIT" justo cuando más hacía falta.
const terminar = (def) => (/;\s*$/.test(def) ? def : def + ';')

const anterior = terminar(
  (
    await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_obtener_saldo_a_asignar'`)
  )[0].def,
)

/** Estado de partida: ¿la función desplegada es la vieja o la nueva? */
const clasificar = (actual, t) => {
  if (cerca(actual, t.liquidez - t.positivos - t.tarjetas)) return 'nueva'
  if (cerca(actual, t.liquidez - t.todos - t.tarjetas)) return 'vieja'
  return 'desconocida'
}

console.log('=== ANTES ===')
const antes = await rpc()
const t = await terminos()
const huellaAntes = await huella()
const estado = clasificar(antes, t)
console.log(`RPC (user 1): ${fmt(antes)}  -> fórmula ${estado}`)
console.log(`liquidez ${fmt(t.liquidez)} | sobres: todos ${fmt(t.todos)} (positivos ${fmt(t.positivos)}, rojos ${fmt(t.negativos)}) | tarjetas ${fmt(t.tarjetas)}`)
console.log(`esperado con la fórmula vieja: ${fmt(t.liquidez - t.todos - t.tarjetas)}`)
console.log(`esperado con la fórmula nueva: ${fmt(t.liquidez - t.positivos - t.tarjetas)}`)
console.log(`huella: ${JSON.stringify(huellaAntes)}`)

if (estado === 'desconocida') {
  console.error('\n✗ el RPC desplegado no coincide con ninguna de las dos fórmulas: no despliego a ciegas.')
  process.exit(1)
}

const sql = fs.readFileSync('temp_sql/130_saldo_deficit_no_suma.sql', 'utf8')
if (estado === 'nueva') {
  // Re-corrida sobre un deploy ya hecho: no hay nada que aplicar, se validan los
  // invariantes. Así el script se puede volver a correr sin romper nada.
  console.log('\nLa función nueva ya está desplegada: se valida sin re-aplicar.')
} else {
  const aplicado = await q(`BEGIN;\n${sql}\nCOMMIT;`)
  if (aplicado?.message) {
    console.error('✗ el deploy falló: ' + aplicado.message)
    process.exit(1)
  }
  console.log('\nSQL aplicado.')
}

console.log('\n=== DESPUÉS ===')
const despues = await rpc()
const t2 = await terminos()
const huellaDespues = await huella()
const esperadoNuevo = t2.liquidez - t2.positivos - t2.tarjetas
console.log(`RPC (user 1): ${fmt(despues)}`)
console.log(`esperado con la fórmula nueva: ${fmt(esperadoNuevo)}`)
console.log(`huella: ${JSON.stringify(huellaDespues)}`)

const errores = []
const valorViejo = t2.liquidez - t2.todos - t2.tarjetas
if (!cerca(despues, esperadoNuevo)) {
  errores.push(`el RPC devuelve ${fmt(despues)} y la fórmula nueva da ${fmt(esperadoNuevo)}`)
}
// La comparación es contra el número que daba la fórmula vieja con los MISMOS
// datos: si el script se re-corre ya desplegado, `antes` ya es el valor nuevo y
// comparar contra él daría un falso negativo.
if (!(despues < valorViejo)) {
  errores.push(`el disponible (${fmt(despues)}) no bajó respecto de la fórmula vieja (${fmt(valorViejo)})`)
}
if (estado === 'vieja' && !cerca(antes - despues, Math.abs(t2.negativos))) {
  errores.push(`la baja (${fmt(antes - despues)}) no coincide con los sobres en rojo (${fmt(Math.abs(t2.negativos))})`)
}
if (despues > t2.liquidez) {
  errores.push(`el disponible (${fmt(despues)}) sigue por encima de la liquidez real (${fmt(t2.liquidez)})`)
}
if (JSON.stringify(huellaAntes) !== JSON.stringify(huellaDespues)) {
  errores.push(`cambió la huella de las tablas: ${JSON.stringify(huellaAntes)} -> ${JSON.stringify(huellaDespues)}`)
}

if (errores.length) {
  console.error('\n✗ POSTCHECK FALLÓ — revierto la función al estado anterior')
  for (const e of errores) console.error('  - ' + e)
  const revertido = await q(`BEGIN;\n${anterior}\nCOMMIT;`)
  if (revertido?.message) {
    console.error('✗✗ NO SE PUDO REVERTIR: ' + revertido.message)
    console.error('   definición buena en scratch/fn_fn_obtener_saldo_a_asignar.sql')
  } else {
    console.error('✓ función anterior restaurada; el disponible volvió a ' + fmt(await rpc()))
  }
  process.exit(1)
}

console.log('\n✓ el disponible quedó en la liquidez real menos lo comprometido en sobres positivos')
console.log(`✓ ${fmt(valorViejo)} -> ${fmt(despues)}: ${fmt(valorViejo - despues)} de déficit que antes se sumaban como si fueran plata`)
console.log('✓ ninguna fila del presupuesto cambió: es una función, no una migración de datos')
