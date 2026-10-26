// tests/inversiones/borrado-revierte-inversion.test.js
//
//   node --test tests/inversiones/borrado-revierte-inversion.test.js
//
// S4 del dueño (2026-10-26): "cuando yo borro desde actividad reciente un agregado de
// dinero, eso debería modificar la inversión. Tal como lo hemos resuelto para las
// liquidaciones parciales, también sería el mecanismo de borrar un error [...] borrando
// una actividad reciente, me debe volver para atrás la operación."
//
// El trigger de borrado existía desde la 86b pero actuaba SÓLO sobre el movimiento de
// creación ('investment_prefix:'), a propósito. La 105 le agrega las ramas del aporte y
// del retiro parcial, cada una inversa exacta de la función que creó el movimiento.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const crudo = fs.readFileSync(
  path.join(repo, 'temp_sql', '105_borrar_movimiento_revierte_inversion.sql'),
  'utf8'
)
// Para las aserciones de AUSENCIA hay que sacar los comentarios: el propio archivo
// documenta lo que no toca.
const sql = crudo.replace(/--.*$/gm, '')

test('el borrado despacha por tipo de movimiento, no por un único prefijo', () => {
  assert.match(sql, /OLD\.detalle LIKE 'investment_contribution:%'/, 'rama del aporte')
  assert.match(sql, /OLD\.detalle LIKE 'rescate_inversion:%'/, 'rama del retiro parcial')
  // La rama del alta se escribe en negativo (NOT LIKE): es el caso que queda por descarte.
  assert.match(
    sql,
    /OLD\.detalle (NOT )?LIKE 'investment_prefix:%'/,
    'rama del alta, que ya existía'
  )
})

test('borrar un aporte devuelve el capital y el valor que había sumado', () => {
  const rama = sql.slice(
    sql.indexOf("investment_contribution:%'"),
    sql.indexOf("rescate_inversion:%'")
  )
  assert.match(rama, /monto_invertido_original\s*=\s*GREATEST\(0, COALESCE\(monto_invertido_original, 0\) - COALESCE\(OLD\.valor_egreso, 0\)\)/)
  assert.match(rama, /valor_mercado_actual\s*=\s*GREATEST\(0, COALESCE\(valor_mercado_actual, monto_invertido_original\) - COALESCE\(OLD\.valor_egreso, 0\)\)/)
  // Lo que NO tiene que hacer: tocar los retiros, que son otra cosa.
  assert.doesNotMatch(rama, /monto_liquidado/, 'borrar un aporte no toca los retiros')
})

test('borrar un retiro parcial devuelve el valor y limpia el capital retirado', () => {
  const desde = sql.indexOf("rescate_inversion:%'")
  const hasta = sql.indexOf("investment_prefix:%'")
  const rama = sql.slice(desde, hasta)
  assert.match(rama, /monto_liquidado\s*=\s*GREATEST\(0, COALESCE\(monto_liquidado, 0\) - COALESCE\(OLD\.valor_ingreso, 0\)\)/)
  assert.match(rama, /valor_mercado_actual\s*=\s*COALESCE\(valor_mercado_actual, monto_invertido_original\) \+ COALESCE\(OLD\.valor_ingreso, 0\)/)
  // Si el retiro era el que la había dejado terminada, vuelve a estar activa.
  assert.match(rama, /estado\s*=/)
  assert.match(rama, /THEN 'activa'/)
  assert.match(rama, /fecha_liquidacion/)
  assert.match(rama, /THEN NULL/)
})

test('deshacer no puede inventar deuda', () => {
  // Si el usuario ya había editado la posición a mano, restar sin piso deja capital o
  // valor negativos, que es peor que el error original.
  assert.equal((sql.match(/GREATEST\(0,/g) || []).length >= 3, true, 'capital, valor y retirado con piso en cero')
})

test('un metadata inesperado no rompe el borrado', () => {
  assert.match(
    sql,
    /v_inversion_id !~ '\^\[0-9\]\+\$'/,
    'un inversion_id no numérico no puede tirar abajo el DELETE con un cast'
  )
  assert.match(sql, /IF v_inversion_row IS NULL THEN\s*RETURN OLD;/, 'si la inversión ya no está, no hace nada')
})

test('el alta de la inversión sigue anulándola entera', () => {
  assert.match(sql, /DELETE FROM public\.p_inversiones/, 'la rama de creación conserva el comportamiento')
  assert.match(sql, /p_caja_id <> OLD\.p_caja_id/, 'y se lleva los movimientos derivados')
})
