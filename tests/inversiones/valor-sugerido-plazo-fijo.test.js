// tests/inversiones/valor-sugerido-plazo-fijo.test.js
//
//   node --test tests/inversiones/valor-sugerido-plazo-fijo.test.js
//
// S10 (ronda 10). Dueño: "¿no debería esa inversión ir diciéndome cuánto está haciendo el
// rendimiento de acuerdo al tiempo transcurrido?" y después: "Solo monto sugerido por el
// cálculo, no hay edición".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { valorSugeridoPlazoFijo } from '../../src/lib/inversionSugerida.ts'

test('un año entero al 100% duplica el capital', () => {
  const s = valorSugeridoPlazoFijo({ capital: 1000, tasaAnualPorcentaje: 100, dias: 365 })
  assert.equal(s.rendimiento, 1000)
  assert.equal(s.valorSugerido, 2000)
  assert.equal(s.dias, 365)
})

test('la mitad del tiempo rinde la mitad, sin capitalizar', () => {
  const s = valorSugeridoPlazoFijo({ capital: 100000, tasaAnualPorcentaje: 60, dias: 182.5 })
  assert.equal(Math.round(s.rendimiento), 30000)
  assert.equal(Math.round(s.valorSugerido), 130000)
})

test('el rendimiento es proporcional a los días transcurridos', () => {
  const treinta = valorSugeridoPlazoFijo({ capital: 100000, tasaAnualPorcentaje: 73, dias: 30 })
  const sesenta = valorSugeridoPlazoFijo({ capital: 100000, tasaAnualPorcentaje: 73, dias: 60 })
  assert.equal(Math.round(sesenta.rendimiento), Math.round(treinta.rendimiento * 2))
})

test('sin tasa, sin capital o sin días no hay sugerencia, y no es un cero', () => {
  assert.equal(valorSugeridoPlazoFijo({ capital: 1000, tasaAnualPorcentaje: 0, dias: 30 }), null)
  assert.equal(valorSugeridoPlazoFijo({ capital: 0, tasaAnualPorcentaje: 50, dias: 30 }), null)
  assert.equal(valorSugeridoPlazoFijo({ capital: 1000, tasaAnualPorcentaje: 50, dias: 0 }), null)
  assert.equal(valorSugeridoPlazoFijo({ capital: null, tasaAnualPorcentaje: null, dias: null }), null)
})
