// tests/presupuestos/exclusividad-plata.test.js
//
//   node --test tests/presupuestos/exclusividad-plata.test.js
//
// Dueño (2026-11-11): "movemos el dinero sin preguntar y avisamos para que el usuario se
// entere. podemos agregar un botón de confirmación para que el usuario dé el OK ante
// este movimiento o rechace si no lo quiere hacer".
//
// La plata es exclusiva entre un padre y sus hijos; el techo no. El servidor rechaza el
// primer intento con una clave y los números, y la pantalla tiene que convertir ese
// rechazo en una pregunta. Eso es lo que se prueba acá, sin renderizar nada.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  leerConfirmacionDeMovimiento,
  textosDeConfirmacion,
} from '../../src/lib/exclusividadPlata.ts'

// PostgREST devuelve el texto del RAISE dentro de error.message, no como objeto.
const errorDe = (payload) => ({ message: `algo antes: ${JSON.stringify(payload)}` })

test('lee el rechazo de un padre que recibe plata y cuenta los hijos', () => {
  const confirmacion = leerConfirmacionDeMovimiento(
    errorDe({ key: 'budget_needs_confirm_move_to_parent', params: { hijos: 3 } }),
  )
  assert.equal(confirmacion.direccion, 'to_parent')
  assert.equal(confirmacion.hijos, 3)
})

test('lee el rechazo de un hijo que se lleva la plata del padre', () => {
  const confirmacion = leerConfirmacionDeMovimiento(
    errorDe({ key: 'budget_needs_confirm_move_from_parent', params: { plata: 50000 } }),
  )
  assert.equal(confirmacion.direccion, 'from_parent')
  assert.equal(confirmacion.plataDelPadre, 50000)
  assert.equal(confirmacion.hijos, 0)
})

test('cualquier otro rechazo del presupuesto no es una confirmación', () => {
  assert.equal(
    leerConfirmacionDeMovimiento(errorDe({ key: 'error_budget_insufficient_base_zero', params: {} })),
    null,
  )
})

test('un error sin JSON adentro no se interpreta como confirmación', () => {
  assert.equal(leerConfirmacionDeMovimiento({ message: 'network error' }), null)
  assert.equal(leerConfirmacionDeMovimiento(undefined), null)
  assert.equal(leerConfirmacionDeMovimiento({ message: '{"key": roto' }), null)
})

test('los textos dicen cuánto se mueve y desde cuántas subcategorías', () => {
  const llamadas = []
  const traducir = (clave, params) => {
    llamadas.push({ clave, params })
    return clave
  }
  const formatearMonto = (n) => `$${n}`

  const haciaElPadre = textosDeConfirmacion(
    { direccion: 'to_parent', hijos: 2, plataDelPadre: 0 },
    10000,
    traducir,
    formatearMonto,
  )
  assert.equal(haciaElPadre.titulo, 'budget_move_to_parent_title')
  assert.equal(limpiar(haciaElPadre.mensaje), 'budget_move_to_parent_msg')
  assert.deepEqual(llamadas.at(-1).params, { monto: '$10000', hijos: 2 })

  const haciaElHijo = textosDeConfirmacion(
    { direccion: 'from_parent', hijos: 0, plataDelPadre: 50000 },
    7000,
    traducir,
    formatearMonto,
  )
  assert.equal(limpiar(haciaElHijo.mensaje), 'budget_move_from_parent_msg')
  assert.deepEqual(llamadas.at(-1).params, { monto: '$7000' })
})

// El traductor de prueba devuelve la clave; el formateador de la pantalla puede
// devolver algo distinto, así que se compara sólo la clave.
const limpiar = (valor) => valor
