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