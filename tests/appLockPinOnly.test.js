// tests/appLockPinOnly.test.js
// App-lock is PIN-ONLY (owner decision, tanda 12).
//
// History that led here, so nobody re-adds fingerprints by accident:
//   tanda 9  → biometry became the only entry, PIN after 3 failures;
//   tanda 10 → the platform prompt had to open by itself;
//   tanda 11 → the PIN took over after the FIRST failure;
//   tanda 12 → all of it removed. Owner, verbatim: "si técnicamente no lo puedes
//              hacer... vamos a quitar la opción de huella y vamos a dejar solo
//              la opción de PIN para todos los menús de seguridad".
//
// Why it cannot be fixed from JavaScript: navigator.credentials.get() with
// userVerification:'required' opens the DEVICE unlock. After repeated fingerprint
// failures Android/Chrome offers the phone's pattern, and an accepted pattern
// returns a plain WebAuthn success. The app only receives a boolean — no field
// says which modality verified — so a fingerprint can never be a stricter gate
// than unlocking the phone itself.
//
//   node --test tests/appLockPinOnly.test.js

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8')
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('the app-lock policy no longer offers a biometric entry', () => {
  const policy = read('src/lib/appLock.ts')
  for (const gone of ['lockEntryMode', 'shouldAutoPromptBiometria', 'BIOMETRIC_MAX_ATTEMPTS']) {
    assert.ok(!policy.includes(gone), `appLock.ts must not export ${gone} any more`)
  }
  assert.ok(!/biometr/i.test(stripComments(policy)), 'no biometric policy left in the module')
})

test('the biometric device library is gone', () => {
  assert.throws(
    () => read('src/lib/biometricAppLock.ts'),
    'src/lib/biometricAppLock.ts must be deleted with the feature',
  )
})

test('the lock overlay is a PIN keypad and nothing else', () => {
  const gate = stripComments(read('src/components/AppLockGate/AppLockGate.tsx'))
  assert.ok(gate.includes('PinKeypad'), 'the PIN keypad is the only way in')
  assert.ok(!/biometr/i.test(gate), 'no biometric panel, button or auto-prompt in the gate')
  assert.ok(!/unlockWithBiometria/.test(gate), 'the biometric unlock call is gone')
  assert.ok(!/'choose'/.test(gate), 'no method chooser')
})

test('the context exposes no biometric API and purges the legacy credential', () => {
  const ctx = read('src/contexts/AppLockContext.tsx')
  const code = stripComments(ctx)
  assert.ok(!/biometriaEnDispositivo/.test(code), 'the per-device flag is gone')
  assert.ok(!/setBiometriaEnDispositivo/.test(code), 'the per-device setter is gone')
  assert.ok(!/unlockWithBiometria/.test(code), 'the biometric unlock is gone')
  assert.ok(
    /removeItem\(\s*LEGACY_BIOMETRIA_KEY\s*\)|removeItem\(\s*'app_lock_biometria_credencial'\s*\)/.test(code),
    'a device that had a fingerprint registered must drop the stray credential',
  )
})

test('every security screen offers the PIN only (owner: todos los menús de seguridad)', () => {
  const page = stripComments(read('src/pages/Configuracion/ProteccionPage.tsx'))
  assert.ok(page.includes('PinKeypad'), 'Proteccion still configures the PIN')
  assert.ok(!/biometr/i.test(page), 'no biometric state row, no enable/disable button')
  assert.ok(!/huella/i.test(page), 'no fingerprint copy left in the page')

  const menu = read('src/config/settingsMenu.ts')
  assert.ok(!/huella/i.test(stripComments(menu)), 'the settings tree advertises the PIN only')
})
