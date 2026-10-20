// tests/inversiones/labels-movimientos.test.js
// Labels de los movimientos de inversión (T7 de la tanda de puesta a punto).
//
//   node --test tests/inversiones/labels-movimientos.test.js
//
// Importa el módulo real con type stripping: src/lib/inversionesLabels.ts
// no tiene imports propios (el runner no resuelve alias de Vite).
//
// Reglas fijadas aquí:
//   * El backend escribe el detalle como 'key: valor' (investment_prefix,
//     liquidation_gain, liquidation_loss, liquidation_capital_recovery,
//     rescate_inversion). La app lo mostraba crudo: "liquidation_gain: GGAL".
//   * La KEY se traduce; el VALOR es el nombre del activo del usuario y
//     nunca se traduce.
//   * Un detalle que NO es una key conocida (categoría vieja, movimiento de
//     otro módulo) se devuelve intacto: no se inventa nada.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  formatInversionDetalle,
  splitInversionDetalle,
  INVERSION_MOVEMENT_KEYS,
} from '../../src/lib/inversionesLabels.ts'

// Doble de traducción: devuelve la key con prefijo para poder distinguirla.
const t = (key) => `T:${key}`

test('la key del backend se separa del valor del activo', () => {
  assert.deepEqual(splitInversionDetalle('investment_prefix: Bitcoin'), {
    key: 'investment_prefix',
    value: 'Bitcoin',
  })
})

test('se reconocen todas las keys que escribe el backend', () => {
  for (const key of INVERSION_MOVEMENT_KEYS) {
    const parsed = splitInversionDetalle(`${key}: GGAL`)
    assert.ok(parsed, `debería reconocer ${key}`)
    assert.equal(parsed.key, key)
    assert.equal(parsed.value, 'GGAL')
  }
})

test('un detalle desconocido NO se toca (categoría de otro módulo)', () => {
  assert.equal(splitInversionDetalle('cat_clothing'), null)
  assert.equal(splitInversionDetalle('transfer_entre_cuentas'), null)
  assert.equal(formatInversionDetalle('cat_clothing', t), 'cat_clothing')
})

test('un detalle desconocido CON valor tampoco se toca (no es una key de inversiones)', () => {
  // Una key de otro módulo con valor ("cat_comida: Almuerzo") no debe
  // reinterpretarse: solo las keys de inversiones se traducen.
  assert.equal(splitInversionDetalle('cat_comida: Almuerzo'), null)
  assert.equal(formatInversionDetalle('cat_comida: Almuerzo', t), 'cat_comida: Almuerzo')
})

test('un detalle vacío o nulo no rompe el render', () => {
  assert.equal(splitInversionDetalle(''), null)
  assert.equal(splitInversionDetalle(null), null)
  assert.equal(splitInversionDetalle(undefined), null)
  assert.equal(formatInversionDetalle('', t), '')
})

test('una key conocida sin valor no se fuerza (no hay qué mostrar)', () => {
  assert.equal(splitInversionDetalle('investment_prefix:'), null)
  assert.equal(splitInversionDetalle('investment_prefix'), null)
})

test('el valor puede contener dos puntos: se parte en el primero', () => {
  const parsed = splitInversionDetalle('liquidation_gain: BTC: USD')
  assert.equal(parsed.key, 'liquidation_gain')
  assert.equal(parsed.value, 'BTC: USD')
})

test('la key se traduce y el nombre del activo se conserva', () => {
  assert.equal(
    formatInversionDetalle('liquidation_gain: GGAL', t),
    'T:liquidation_gain: GGAL'
  )
  assert.equal(
    formatInversionDetalle('investment_prefix: Bitcoin', t),
    'T:investment_prefix: Bitcoin'
  )
})

test('el nombre del activo NO se traduce: es texto del usuario', () => {
  const resultado = formatInversionDetalle('rescate_inversion: Plazo Fijo Galicia', t)
  assert.ok(resultado.includes('Plazo Fijo Galicia'))
  assert.ok(!resultado.includes('T:Plazo Fijo Galicia'))
})