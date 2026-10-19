// tests/pinFormat.test.js
// Owner tanda 5, bug 3: the PIN must accept whatever four digits the user
// chooses. The "too simple" rule (0000/1111/.../9999) was a policy the owner
// does not want: it blocked the confirmation step with
// "Ese PIN es demasiado simple. Elegí otros 4 dígitos."
//
//   node --test tests/pinFormat.test.js

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PIN_LENGTH, validatePin } from '../src/lib/pinFormat.ts'

test('the PIN is exactly four digits', () => {
  assert.equal(PIN_LENGTH, 4)
  assert.equal(validatePin('1234'), null)
  assert.equal(validatePin('0000'), null)
  assert.equal(validatePin('9999'), null)
  assert.equal(validatePin('123'), 'app_lock_pin_invalido')
  assert.equal(validatePin('12345'), 'app_lock_pin_invalido')
  assert.equal(validatePin('12a4'), 'app_lock_pin_invalido')
  assert.equal(validatePin(null), 'app_lock_pin_invalido')
})

test('repeated digits are allowed: the owner decides his own PIN', () => {
  for (const pin of ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999']) {
    assert.equal(validatePin(pin), null, `${pin} must be accepted`)
  }
})

test('no "too simple" branch survives in the shared format contract', () => {
  const src = fs.readFileSync(new URL('../src/lib/pinFormat.ts', import.meta.url), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.ok(!src.includes('app_lock_pin_debil'), 'the weak-PIN rejection must be gone')
  assert.ok(!/\\1\{3\}/.test(src), 'no repeated-digit pattern is enforced anymore')
})
