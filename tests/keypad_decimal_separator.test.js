// tests/keypad_decimal_separator.test.js
// The movement-entry calculator must present the decimal key and its displays
// with the USER'S regional decimal separator ('.' default, ',' supported),
// while keeping every emitted value canonical ('.') so existing parseFloat
// consumers never truncat.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { withUserDecimalSeparator } from '../src/utils/math.ts'

test("expression with decimals is shown with the user's separator", () => {
  assert.equal(withUserDecimalSeparator('1254.14', ','), '1254,14')
  assert.equal(withUserDecimalSeparator('1254.14', '.'), '1254.14')
})

test('operators keep their meaning and only decimals switch', () => {
  assert.equal(withUserDecimalSeparator('3*2.5+1.1', ','), '3*2,5+1,1')
})

test('empty expression stays empty (display falls back to zero)', () => {
  assert.equal(withUserDecimalSeparator('', ','), '')
})

test('unknown/empty separator config falls back to canonical dot', () => {
  assert.equal(withUserDecimalSeparator('1.5', ''), '1.5')
  assert.equal(withUserDecimalSeparator('1.5', '/'), '1.5')
})
test('display: miles+decimal formateados segun la config del usuario', async () => {
  const { formatExpressionForDisplay } = await import('../src/utils/math.ts')
  // UK (miles ',', decimal '.')
  assert.equal(formatExpressionForDisplay('10000', '.', ','), '10,000')
  assert.equal(formatExpressionForDisplay('1234.56', '.', ','), '1,234.56')
  // es-AR (miles '.', decimal ',')
  assert.equal(formatExpressionForDisplay('1234.56', ',', '.'), '1.234,56')
  assert.equal(formatExpressionForDisplay('1000000', ',', '.'), '1.000.000')
  // expresiones con operadores
  assert.equal(formatExpressionForDisplay('10000*2', ',', '.'), '10.000*2')
  assert.equal(formatExpressionForDisplay('3*2.5+1.1', ',', '.'), '3*2,5+1,1')
  // mientras tipea: decimal pendiente y punto inicial
  assert.equal(formatExpressionForDisplay('12.', ',', '.'), '12,')
  assert.equal(formatExpressionForDisplay('.5', ',', '.'), ',5')
  // guard: separadores iguales -> canonicos
  assert.equal(formatExpressionForDisplay('1000', '.', '.'), '1000')
  assert.equal(formatExpressionForDisplay('', ',', '.'), '')
})
