// tests/inversiones/posicion-existente.test.js
//
//   node --test tests/inversiones/posicion-existente.test.js
//
// S1: "el dinero no sale de una billetera real, sino que ya está ahí en su cartera
// de inversiones".
// S3: "capital = valor actual".
// S4: "obligatoria con opcion a elegir una fecha, pero por defecto hoy si el usuario
// no elige".
// S5: "billeteras no son inversiones. Lo que el user declara en billeteras, no son
// inversiones".
// S6 (derivada de S3): si el valor es explícito no hay devengue por TNA.
// S7 (derivada de S1): una posición sin movimiento necesita su propio camino de borrado.
// S8: el alta desde billetera no cambia.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

// Los archivos del repo están en CRLF: se normaliza para que las anclas con
// salto de línea no dependan del sistema donde corre el test.
const leer = (...partes) =>
  fs.readFileSync(path.join(repo, ...partes), 'utf8').replace(/\r\n/g, '\n')
// Los comentarios explican el cambio en pasado: si se parsean, una aserción de
// ausencia falla por el propio comentario.
const sinComentarios = (sql) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

const sql = sinComentarios(leer('temp_sql', '111_posicion_existente.sql'))
const modal = leer('src', 'components', 'inversiones', 'NuevaInversionModal.tsx')
const detalle = leer('src', 'components', 'inversiones', 'DetalleInversionView.tsx')
const detalleCss = leer('src', 'components', 'inversiones', 'DetalleInversionView.css').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
)

function bloqueDesde(texto, ancla, cierre = '\n') {
  const inicio = texto.indexOf(ancla)
  assert.ok(inicio >= 0, `no encontré "${ancla}"`)
  return texto.slice(inicio, texto.indexOf(cierre, inicio) + 1)
}

// ─────────────────────────── SQL: fn_crear_inversion ───────────────────────────

test('la firma acepta la fecha de inicio y no deja dos overloads vivos', () => {
  assert.match(sql, /p_fecha_inicio date DEFAULT NULL/, 'falta p_fecha_inicio')
  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.fn_crear_inversion\(text, numeric, numeric, bigint, text, text\)/,
    'sin el DROP quedan dos firmas y PostgREST no puede resolver la llamada'
  )
})

test('S3: en el modo preexistente el capital es el valor actual', () => {
  const insert = bloqueDesde(sql, 'INSERT INTO p_inversiones (', ';')
  assert.match(
    insert,
    /WHEN v_es_existente THEN p_monto/,
    'el valor de mercado tiene que ser el monto cargado, no NULL (si es NULL devenga por TNA)'
  )
  // El capital es la misma columna de monto: no hay un segundo importe que cargar.
  assert.doesNotMatch(sql, /p_capital/, 'no se agrega un campo de capital: S3 dice capital = valor actual')
})

test('S6: la posición preexistente no devenga por TNA', () => {
  assert.match(
    sql,
    /CASE WHEN v_es_existente THEN 0 ELSE p_tasa_anual_tna END/,
    'la TNA guardada tiene que ser 0 en el modo preexistente'
  )
  const tna = bloqueDesde(sql, "IF p_tipo_activo = 'plazo_fijo' AND p_tasa_anual_tna <= 0")
  assert.match(tna, /AND NOT v_es_existente/, 'la TNA obligatoria aplica solo al camino desde billetera')
})

test('S4: la fecha es obligatoria en el modo preexistente y no puede ser futura', () => {
  assert.match(sql, /v_fecha_inicio := COALESCE\(p_fecha_inicio, CURRENT_DATE\)/)
  assert.match(sql, /IF v_fecha_inicio > CURRENT_DATE THEN/, 'falta el rechazo de fechas futuras')
  assert.match(sql, /error_investment_start_date_future/)
  assert.match(
    sql,
    /ELSE\s+v_fecha_inicio := CURRENT_DATE;/,
    'desde billetera la fecha sigue siendo hoy (S8)'
  )
})

test('S1: sin billetera no se escribe ningún movimiento en p_caja', () => {
  assert.match(
    sql,
    /IF p_billetera_origen_id IS NOT NULL THEN\s*INSERT INTO p_caja/,
    'el INSERT en p_caja tiene que seguir detrás del chequeo de billetera'
  )
})

// ──────────────────────────── SQL: fn_eliminar_inversion ────────────────────────────

test('S7: existen dos caminos de borrado y no se pisan', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fn_eliminar_inversion\(p_inversion_id bigint\)/)
  // El cuerpo abre con 'AS $function$': el cierre es el SEGUNDO delimitador.
  const inicioFn = sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_eliminar_inversion')
    const abre = sql.indexOf('$function$', inicioFn)
  const cuerpo = sql.slice(inicioFn, sql.indexOf('$function$', abre + 1))
  assert.match(
    cuerpo,
    /\(metadata ->> 'inversion_id'\) = p_inversion_id::text/,
    'la guarda tiene que mirar los movimientos por metadata: es donde las cinco ramas guardan el id'
  )
  assert.match(cuerpo, /error_investment_has_movements/, 'falta el error que explica por qué no se puede')
  assert.match(
    cuerpo,
    /DELETE FROM public\.p_inversiones/,
    'el borrado de una posición sin movimientos es el DELETE de la fila'
  )
})

// ────────────────────────────── Modal: el modo ──────────────────────────────

test('el modal pregunta el origen antes que nada y ofrece las dos opciones', () => {
  assert.match(modal, /type TipoOrigen = 'billetera' \| 'existente'/)
  assert.match(modal, /name="origen_inversion"/)
  assert.match(modal, /'origin_from_wallet'/)
  assert.match(modal, /'origin_already_owned'/)
})

test('S1: en el modo preexistente no se exige billetera', () => {
  assert.match(
    modal,
    /const billeteraOk = esExistente \|\| \(billeteraId !== '' && billeteraElegibleActual !== null\)/,
    'la validación de billetera tiene que ceder en el modo preexistente'
  )
  assert.match(modal, /\{!esExistente && \(/, 'el selector de billetera no se muestra en modo preexistente')
})

test('S1: el alta manda billetera nula y la fecha elegida', () => {
  const submit = bloqueDesde(modal, 'const handleSubmit', 'if (!isOpen) return null')
  assert.match(submit, /p_billetera_origen_id: esExistente \? null : Number\(billeteraId\)/)
  assert.match(submit, /p_fecha_inicio: fechaInicio/, 'falta la fecha en el payload')
  assert.match(
    submit,
    /esExistente \? \{ p_fecha_inicio: fechaInicio \} : \{\}/,
    'la fecha solo tiene que viajar en el modo preexistente (S8)'
  )
})

test('S8: el alta desde billetera conserva su contrato', () => {
  const submit = bloqueDesde(modal, 'const handleSubmit', 'if (!isOpen) return null')
  assert.match(submit, /p_billetera_origen_id: esExistente \? null : Number\(billeteraId\)/)
  assert.match(submit, /!esExistente && tipo === 'plazo_fijo' \? tasaNum : 0/, 'la TNA sigue viajando en plazo fijo')
  // La regla de saldo del modal no se toca.
  assert.match(modal, /billeterasDeLaMoneda\.filter\(\(b\) => Number\(b\.saldo\) >= montoNum\)/)
})

test('S4: la fecha viene con hoy y el input no acepta futuro', () => {
  assert.match(modal, /setFechaInicio\(hoyISO\(\)\)/, 'al entrar al modo preexistente la fecha se precarga con hoy')
  assert.match(modal, /max=\{hoyISO\(\)\}/, 'el input tiene que acotar el máximo a hoy')
  assert.match(modal, /type="date"/)
  // hoyISO() arma la fecha local: toISOString() se iría al día siguiente en husos negativos.
  const helper = bloqueDesde(modal, 'function hoyISO()', '}')
  assert.doesNotMatch(helper, /toISOString/, 'toISOString pasa a UTC y adelanta el día')
})

test('S6: en modo preexistente no se pide TNA', () => {
  assert.match(modal, /\{tipo === 'plazo_fijo' && !esExistente && \(/)
})

test('S5: el texto fija la frontera entre billetera e inversión', () => {
  assert.match(modal, /t\('helper_existing_investment'\)/)
  assert.match(modal, /t\('disclaimer_existing_investment'\) : t\('disclaimer_new_investment'\)/)
})

// ──────────────────────────── Detalle: el borrado ────────────────────────────

test('S7: borrar aparece solo donde puede funcionar', () => {
  assert.match(
    detalle,
    /\{data\.billetera_origen_id == null && !confirmBorrar && \(/,
    'el botón se muestra solo para posiciones sin billetera'
  )
  assert.match(detalle, /rpc\('fn_eliminar_inversion', \{ p_inversion_id: data\.inversion_id \}\)/)
  assert.match(detalle, /onDeleted\?\.\(\)/, 'después de borrar hay que avisar para recargar la lista')
})

test('el detalle tipa la columna nueva', () => {
  assert.match(detalle, /billetera_origen_id\?: number \| null/)
})

test('el estilo del borrado no trae colores hardcodeados', () => {
  const bloque = bloqueDesde(detalleCss, '.detalle-action-btn--delete', '}')
  assert.doesNotMatch(bloque, /#[0-9a-fA-F]{3,8}/, 'nada de hex: el tema claro/oscuro lo resuelve el token')
  assert.match(bloque, /var\(--coral-ink\)/)
})
