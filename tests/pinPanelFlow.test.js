// tests/pinPanelFlow.test.js
// Owner tanda 5 (bugs 4, 5, 6 y 7 de la tanda): the PIN panel of Ajustes must
// fit on one screen, auto-execute on the fourth digit (no accept/cancel
// buttons), report a mismatched confirmation, and show ONE message zone that
// changes with the current step.
//
//   node --test tests/pinPanelFlow.test.js

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PIN_CONFIRM_MAX_ATTEMPTS,
  PIN_STEP_INSTRUCTION,
  nextConfirmationAttempt,
  pinConfirmationOutcome,
  pinFailureKey,
  pinInstructionKey,
} from '../src/lib/pinPanelFlow.ts'

test('the error replaces the step instruction in the single message zone', () => {
  assert.equal(pinInstructionKey('activar_nuevo', null), 'app_lock_reset_subtitle')
  assert.equal(pinInstructionKey('activar_nuevo', 'app_lock_pin_mismatch'), 'app_lock_pin_mismatch')
  assert.equal(pinInstructionKey('idle', null), null)
})

test('every non-idle step has instruction copy', () => {
  for (const [step, key] of Object.entries(PIN_STEP_INSTRUCTION)) {
    if (step === 'idle') {
      assert.equal(key, null)
      continue
    }
    assert.ok(typeof key === 'string' && key.length > 0, `${step} needs an instruction key`)
  }
})

test('a mismatched confirmation is reported and never treated as a match', () => {
  assert.equal(pinConfirmationOutcome('1234', '1234'), 'match')
  assert.equal(pinConfirmationOutcome('1234', '1235'), 'mismatch')
  assert.equal(pinConfirmationOutcome(null, '1234'), 'mismatch')
  assert.equal(pinConfirmationOutcome('1234', ''), 'mismatch')
})

test('a wrong current PIN produces the wrong-PIN message (never silence)', () => {
  assert.equal(pinFailureKey('pin_actual_incorrecto'), 'app_lock_wrong_current_pin')
  assert.equal(pinFailureKey('pin_incorrecto'), 'app_lock_wrong_current_pin')
  assert.equal(pinFailureKey('en_cooldown'), 'app_lock_cooldown_message')
  assert.equal(pinFailureKey('unavailable'), 'proteccion_backend_pendiente')
  assert.equal(pinFailureKey('error'), 'app_lock_error_generico')
  assert.equal(pinFailureKey(undefined), 'app_lock_error_generico')
})

test('the panel has no accept/cancel footer and the keypad is compact', () => {
  const page = fs
    .readFileSync(new URL('../src/pages/Configuracion/ProteccionPage.tsx', import.meta.url), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const panelsStart = page.indexOf('function NuevoPinPanel')
  assert.ok(panelsStart > -1, 'the panels must exist')
  const panels = page.slice(panelsStart)
  assert.ok(!panels.includes('config-action-button'), 'no accept/cancel button inside the PIN panels')
  assert.match(panels, /compact/, 'the embedded keypad asks for its compact size')
  assert.match(page, /pinInstructionKey/, 'the panel renders the single message zone')
  assert.match(page, /pinConfirmationOutcome/, 'the confirmation uses the shared outcome rule')
  assert.match(page, /pinFailureKey/, 'failures map through the shared reason table')

  const keypad = fs.readFileSync(new URL('../src/components/AppLockGate/PinKeypad.tsx', import.meta.url), 'utf-8')
  assert.match(keypad, /compact\?/, 'PinKeypad exposes a compact prop')
  const css = fs.readFileSync(new URL('../src/components/AppLockGate/AppLockGate.css', import.meta.url), 'utf-8')
  assert.match(css, /\.app-lock-keypad--compact/, 'the compact size has its own rules')
})

// ── Owner tanda 6: the failed confirmation must say "no coincide, volvé a
// ingresarlo" and, on the third failure, return to the previous screen with an
// error. Before this the panel looped forever with no way out.

test('the confirmation retries twice, then sends the user back', () => {
  const first = nextConfirmationAttempt(0)
  assert.equal(first.attempts, 1)
  assert.equal(first.exhausted, false)
  assert.equal(first.messageKey, 'app_lock_pin_confirm_retry')

  const second = nextConfirmationAttempt(first.attempts)
  assert.equal(second.attempts, 2)
  assert.equal(second.exhausted, false)
  assert.equal(second.messageKey, 'app_lock_pin_confirm_retry')

  const third = nextConfirmationAttempt(second.attempts)
  assert.equal(third.attempts, PIN_CONFIRM_MAX_ATTEMPTS)
  assert.equal(third.exhausted, true)
  assert.equal(third.messageKey, 'app_lock_pin_confirm_failed')
})

test('the retry copy says the confirmation did not match and asks for the same PIN', () => {
  const es = fs.readFileSync(new URL('../src/locales/es.ts', import.meta.url), 'utf-8')
  assert.match(es, /app_lock_pin_confirm_retry:\s*"[^"]*no coincide[^"]*"/i, 'the retry copy must state the mismatch')
  assert.match(es, /app_lock_pin_confirm_retry:\s*"[^"]*mismo PIN[^"]*"/i, 'and that the same PIN is expected')
  assert.match(es, /app_lock_pin_confirm_failed:\s*"[^"]*no coinciden[^"]*"/i, 'the exit copy states the PINs differ')
})

test('the panel counts attempts and can leave the confirmation step', () => {
  const page = fs.readFileSync(new URL('../src/pages/Configuracion/ProteccionPage.tsx', import.meta.url), 'utf-8')
  assert.match(page, /nextConfirmationAttempt/, 'the panel uses the shared retry rule')
  assert.match(page, /onAbort/, 'the panel can return to the previous screen')
  assert.match(page, /setIntentos/, 'the retry counter is tracked')
})
