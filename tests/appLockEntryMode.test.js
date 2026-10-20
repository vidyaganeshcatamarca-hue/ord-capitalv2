// tests/appLockEntryMode.test.js
// App-lock entry policy (owner tanda 9, spec S4 revision).
//
// Owner, verbatim: "si tiene la huella registrada, no le pide PIN. Directamente
// pide la huella y no le pregunta cuál sistema quiere usar, usa siempre la
// huella. A menos que la huella no se pueda detectar por algún problema de tres
// veces, ahí recién le podemos pedir un PIN."
//
// So the lock screen has no method chooser: biometry registered means biometry,
// and the PIN appears only as a fallback after three biometric failures.
//
//   node --test tests/appLockEntryMode.test.js

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BIOMETRIC_MAX_ATTEMPTS, lockEntryMode } from '../src/lib/appLock.ts'

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('without biometry on this device the lock asks for the PIN', () => {
  assert.equal(lockEntryMode(false, 0), 'pin')
  assert.equal(lockEntryMode(false, 1), 'pin')
  assert.equal(lockEntryMode(false, 99), 'pin')
})

test('with biometry registered the lock goes straight to the fingerprint', () => {
  assert.equal(BIOMETRIC_MAX_ATTEMPTS, 3, 'owner: three failures, then the PIN')
  assert.equal(lockEntryMode(true, 0), 'biometria', 'never asks which method first')
  assert.equal(lockEntryMode(true, 1), 'biometria')
  assert.equal(lockEntryMode(true, 2), 'biometria')
})

test('the PIN appears only after three biometric failures', () => {
  assert.equal(lockEntryMode(true, 3), 'pin')
  assert.equal(lockEntryMode(true, 4), 'pin')
})

test('a garbage failure count fails closed to the PIN', () => {
  // A broken sensor or a lost counter must never leave the user with no way in.
  assert.equal(lockEntryMode(true, Number.NaN), 'pin')
  assert.equal(lockEntryMode(true, -5), 'biometria', 'negative counts are clamped to zero')
})

test('the gate has no method chooser and derives the entry from the rule', () => {
  const gate = stripComments(
    fs.readFileSync(new URL('../src/components/AppLockGate/AppLockGate.tsx', import.meta.url), 'utf-8'),
  )
  assert.ok(gate.includes('lockEntryMode('), 'the gate must use the pure policy helper')
  assert.ok(
    !/app_lock_use_pin/.test(gate),
    'S4 revision: no "Usar PIN" button — biometry is not offered as an alternative',
  )
  assert.ok(
    !/'choose'/.test(gate),
    'there is no method-chooser mode any more',
  )
  assert.ok(
    /onBiometricFailure/.test(gate),
    'a failed or cancelled biometric attempt must be counted',
  )
  assert.ok(
    gate.includes('app_lock_biometria_fallback'),
    'the keypad explains why it appeared after three failures',
  )
})
