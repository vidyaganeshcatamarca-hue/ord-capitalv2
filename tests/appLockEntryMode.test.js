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

import {
  BIOMETRIC_MAX_ATTEMPTS,
  lockEntryMode,
  shouldAutoPromptBiometria,
} from '../src/lib/appLock.ts'

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

test('the lock opens the biometric prompt by itself, once per presentation', () => {
  assert.equal(shouldAutoPromptBiometria('biometria', false), true, 'no tap-to-authorize step')
  assert.equal(
    shouldAutoPromptBiometria('biometria', true),
    false,
    'never re-open the system sheet on its own: it would spam and burn the 3 attempts',
  )
  assert.equal(shouldAutoPromptBiometria('pin', false), false, 'the PIN path has nothing to auto-open')
  assert.equal(shouldAutoPromptBiometria('pin', true), false)

  const gate = stripComments(
    fs.readFileSync(new URL('../src/components/AppLockGate/AppLockGate.tsx', import.meta.url), 'utf-8'),
  )
  assert.ok(gate.includes('shouldAutoPromptBiometria('), 'the gate wires the pure rule')
  assert.ok(/useEffect\(/.test(gate), 'the attempt is fired from an effect, not from a click')
  assert.ok(
    !/app_lock_use_biometria/.test(gate),
    'the old "Desbloquear con la huella" gate button is gone',
  )
})

test('the lock copy sits above the platform biometric sheet (owner tanda 10)', () => {
  const css = stripComments(
    fs.readFileSync(new URL('../src/components/AppLockGate/AppLockGate.css', import.meta.url), 'utf-8'),
  )
  const start = css.indexOf('.app-lock-gate {')
  const rule = css.slice(start, css.indexOf('}', start))
  assert.match(rule, /align-items:\s*flex-start/, 'a centred card hid behind the OS prompt')
  assert.match(rule, /padding:[^;]*4\.5rem/, 'top clearance keeps the copy off the status bar')
})
