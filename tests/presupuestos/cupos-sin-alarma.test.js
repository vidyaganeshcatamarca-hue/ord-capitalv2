// El reparto 50-25-15-10 es una referencia, no una regla que se pueda incumplir.
// Dueño (2026-11-13): «ninguno de los dos es alerta, es informativo».
// Medido en ego: Savings al 0% salía con punto rojo y pintaba la tarjeta entera con
// borde rojo, mientras Tithing al 0% salía verde. Mismo valor, colores opuestos, y el
// rojo alarmaba sobre un reparto que en base cero no gobierna ningún cálculo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tarjeta = readFileSync(
  new URL('../../src/pages/Presupuestos/CuposResumenCard.tsx', import.meta.url),
  'utf8',
)
const pagina = readFileSync(
  new URL('../../src/pages/Presupuestos/PresupuestosPage.tsx', import.meta.url),
  'utf8',
)

test('la tarjeta de reparto no enciende ninguna alarma roja', () => {
  assert.doesNotMatch(tarjeta, /if \(estado === 'rojo_excedido'\)/,
    'el cupo excedido ya no debe mapear a rojo en esta tarjeta')
  assert.doesNotMatch(tarjeta, /return 'rojo'/)
})

test('el peor estado de la tarjeta no puede ser rojo', () => {
  const desde = tarjeta.indexOf('const peorEstado')
  assert.notEqual(desde, -1, 'no encontré peorEstado')
  const bloque = tarjeta.slice(desde, tarjeta.indexOf('return estados.some', desde))
  assert.doesNotMatch(bloque, /'rojo'/)
})

test('los sobres conservan su alarma roja', () => {
  // Esto NO se toca: un sobre que se pasó de su techo sí es una alerta real, y el
  // color de su barra depende de ese mapeo.
  assert.match(pagina, /if \(estado === 'rojo_excedido'\) return 'rojo'/)
})
