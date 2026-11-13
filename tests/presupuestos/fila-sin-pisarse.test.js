// Contrato de la cabecera de fila y de la franja del rubro padre en móvil.
// Medido en ego el 2026-11-13 con 390x844: ver scratch/ego-r10 13, 14 y 15.
// Antes: el importe se montaba sobre el botón «+ Assign» (6 filas de 30) y la franja
// del padre metía 5 columnas en 290 px, así que se leía «UNASSIGNEDPROGRESS».
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../../src/pages/Presupuestos/Presupuestos.css', import.meta.url), 'utf8')

const bloque = (selector) => {
  const i = css.indexOf(`${selector} {`)
  assert.notEqual(i, -1, `falta la regla ${selector}`)
  const fin = css.indexOf('}', i)
  return css.slice(i, fin)
}

test('la cabecera de la fila va en columna y le reserva el lugar al botón', () => {
  const cabecera = bloque('.sobre-fila-top')
  assert.match(cabecera, /flex-direction:\s*column/)
  // Sin esta reserva el importe vuelve a meterse abajo del pill: el botón es absoluto.
  const reserva = cabecera.match(/padding-right:\s*(\d+)px/)
  assert.ok(reserva, 'la cabecera tiene que reservar el ancho del botón')
  assert.ok(Number(reserva[1]) >= 60, `reserva insuficiente: ${reserva[1]}px`)
})

test('el nombre no se recorta en las filas normales', () => {
  const texto = bloque('.sobre-nombre-texto')
  // La elipsis es la red de seguridad para un nombre larguísimo, no el modo normal:
  // en columna el nombre tiene todo el ancho y en la medición no hubo ninguno cortado.
  assert.match(texto, /text-overflow:\s*ellipsis/)
  assert.match(texto, /min-width:\s*0/)
  assert.doesNotMatch(bloque('.sobre-fila-top'), /justify-content:\s*space-between/,
    'con space-between el importe se va al borde y choca con el botón absoluto')
})

test('la franja del rubro padre envuelve en dos filas', () => {
  const franja = bloque('.sobre-stats--padre')
  assert.match(franja, /flex-wrap:\s*wrap/)
  // Cinco columnas en 290 px dan celdas de 58 px y «Unassigned» mide 73 con la
  // tipografía del tema: no entra recortando, entra envolviendo.
  assert.match(css, /\.sobre-stats--padre \.sobre-stat \{[^}]*flex:\s*1 1 30%/)
})

test('el botón Assign sigue siendo el que no ocupa lugar en el flujo', () => {
  const boton = bloque('.sobre-btn-asignar')
  assert.match(boton, /position:\s*absolute/)
  assert.match(boton, /right:\s*14px/)
})
