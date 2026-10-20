// tests/accountDeletionGate.test.js
// Contract checks for the S15 deletion gate (feature: menu-ajustes, task T3).
// Pure module: no React, no supabase, no DOM, no network, no clock reads —
// `now` is injected so the gate is deterministic.
//
//   node --test tests/accountDeletionGate.test.js
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DAY_GRACE_WINDOW,
  DELETE_DATA_BACKEND_AVAILABLE,
  PIN_CONFIGURED_FALLBACK,
  pinConfiguredFromLockState,
  resolveDeletionGate,
} from '../src/lib/accountDeletionGate.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODULE_PATH = path.join(__dirname, '..', 'src', 'lib', 'accountDeletionGate.ts')
const CARD_PATH = path.join(
  __dirname,
  '..',
  'src',
  'components',
  'configuracion',
  'ConfiguracionBorradoCard.tsx',
)

const DAY_MS = 86_400_000
const WINDOW_MS = DAY_GRACE_WINDOW * DAY_MS

/** Fixed clock: the gate must never read the real clock on its own. */
const NOW = new Date('2026-10-16T12:00:00.000Z')
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY_MS).toISOString()

function gate(signupAt, pinConfigured, now = NOW) {
  return resolveDeletionGate({ signupAt, pinConfigured, now })
}

test('the module exposes the S15 window and the integration constants', () => {
  assert.equal(DAY_GRACE_WINDOW, 15, 'S15/L10 — the first 15 days need no PIN')
  // S6/T5 — legacy migration fallback; the live card uses useAppLock instead.
  assert.equal(PIN_CONFIGURED_FALLBACK, false)
  // S15/T5c — the "borrar mis datos" RPC exists (owner-approved execution).
  assert.equal(DELETE_DATA_BACKEND_AVAILABLE, true)
})

test('grace window: inside the first 15 days the gate stays open (S15/L10)', () => {
  const cases = [
    ['signup right now', daysAgo(0)],
    ['one day of use', daysAgo(1)],
    ['nine days of use', daysAgo(9)],
    ['exactly fifteen days of use', daysAgo(DAY_GRACE_WINDOW)],
    ['fifteen full days plus half a day', new Date(NOW.getTime() - WINDOW_MS - DAY_MS / 2).toISOString()],
  ]
  for (const [label, signupAt] of cases) {
    assert.deepEqual(gate(signupAt, false), { locked: false, reason: null, requiresPin: false }, label)
  }
})

test('past the window without a PIN the gate locks with reason pin_required (S15)', () => {
  assert.deepEqual(gate(daysAgo(DAY_GRACE_WINDOW + 1), false), {
    locked: true,
    reason: 'pin_required',
    requiresPin: true,
  })
  assert.deepEqual(gate(daysAgo(400), false), { locked: true, reason: 'pin_required', requiresPin: true })
})

test('past the window with a configured PIN the gate opens but still demands the PIN (S15)', () => {
  // S15 verbatim: "el usuario para borrar los datos tiene que PONER el pin".
  // Having one is not enough: the card keeps the destructive UI hidden until
  // the server accepts it, hence requiresPin === true.
  assert.deepEqual(gate(daysAgo(DAY_GRACE_WINDOW + 1), true), {
    locked: false,
    reason: null,
    requiresPin: true,
  })
  assert.deepEqual(gate(daysAgo(400), true), { locked: false, reason: null, requiresPin: true })
})

test('missing or unparseable signup date is fail-closed (deletion is dangerous)', () => {
  const broken = [null, undefined, '', '   ', 'not-a-date', '16/10/2026']
  for (const signupAt of broken) {
    assert.deepEqual(
      gate(signupAt, false),
      { locked: true, reason: 'unknown_signup', requiresPin: true },
      `signupAt=${String(signupAt)}`,
    )
    // Fail-closed even when the PIN exists: we cannot prove the account age.
    assert.deepEqual(gate(signupAt, true), {
      locked: true,
      reason: 'unknown_signup',
      requiresPin: true,
    })
  }
})

test('the helper is deterministic: same input, same output, `now` is injected', () => {
  const signupAt = daysAgo(DAY_GRACE_WINDOW + 1)
  assert.deepEqual(gate(signupAt, false), gate(signupAt, false))
  // A different anchor on the same clock moves the gate.
  assert.notDeepEqual(gate(signupAt, false), gate(daysAgo(1), false))
})

test('the module stays pure: no React, no supabase, no clock reads', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf-8')
  assert.ok(!/from\s+['"]react['"]/.test(source), 'accountDeletionGate.ts must not import react')
  assert.ok(!/supabase/i.test(source), 'accountDeletionGate.ts must not touch supabase')
  assert.ok(!/from\s+['"]@\//.test(source), 'accountDeletionGate.ts must not import app aliases')
  assert.ok(!/Date\.now\s*\(/.test(source), 'the caller injects `now`; the module must not read the clock')
  assert.ok(!/new\s+Date\s*\(\s*\)/.test(source), 'the module must not build its own Date')
})

// ── Wiring contract (S15 / T3) ──────────────────────────────────────────────
// The card behind the `component:ConfiguracionBorradoCard` slot owns the gate,
// anchors on the auth signup date and reuses the existing DeleteAccountCard.

test('the card wires the gate to the auth signup date and reuses DeleteAccountCard (S15, pi2+h2c integration)', () => {
  const source = fs.readFileSync(CARD_PATH, 'utf-8')
  assert.ok(source.includes('resolveDeletionGate('), 'the card must use the pure gate')
  assert.ok(source.includes('created_at'), 'the card must read the auth signup date')
  assert.ok(source.includes('useAuth()'), 'the anchor comes from the auth session, not from a new RPC')
  assert.ok(source.includes('DeleteAccountCard'), 'the account option reuses the existing card')
  assert.ok(!/supabase\.from/.test(source), 'the card must not query tables directly (RPC-only)')
  assert.ok(source.includes("rpc('fn_borrar_datos_usuario'"), 'the data option calls the T5c RPC through the rpc helper')
  assert.ok(source.includes('useAppLock()'), 'pinConfigured comes from the pi2 single truth (lockState === activa)')
  assert.ok(!/from\s+['"]@\/contexts\/ModoAppContext['"]/.test(source), 'the gate does not depend on the app mode')
})

// ── Regression: owner bug tanda 7 ────────────────────────────────────────────
// The card compared `lockState === 'activa'`. `lockState` is the RESOLVED state
// (a discriminated union of objects, src/lib/appLock.ts) and 'activa' is server
// vocabulary: the comparison was always false, so every account past day 15 was
// told to configure a PIN it already had. Proteccion kept saying "Activada" —
// the two screens disagreed because only this one read the wrong axis.

test('pinConfiguredFromLockState reads the resolved OBJECT, never the server string', () => {
  // The real shapes returned by resolveLockState().
  assert.equal(pinConfiguredFromLockState({ kind: 'locked' }), true, 'active PIN')
  assert.equal(
    pinConfiguredFromLockState({ kind: 'cooldown' }),
    true,
    'locked-out PIN still exists: the card must not claim it is missing',
  )
  assert.equal(pinConfiguredFromLockState({ kind: 'sin_pin' }), false, 'no PIN configured')
  assert.equal(
    pinConfiguredFromLockState({ kind: 'reset_pending' }),
    false,
    'the server already cleared the PIN after a lockout',
  )
  assert.equal(pinConfiguredFromLockState(null), false, 'unknown fails closed')
  assert.equal(pinConfiguredFromLockState(undefined), false, 'unknown fails closed')
  // The bug in one line: the server string is not a member of the union.
  assert.equal(pinConfiguredFromLockState('activa'), false)
})

test('a user with an active PIN is never told to configure one (bug regression)', () => {
  const pastWindow = daysAgo(DAY_GRACE_WINDOW + 1)
  const pinConfigured = pinConfiguredFromLockState({ kind: 'locked' })
  const result = gate(pastWindow, pinConfigured)
  assert.equal(result.locked, false, 'the deletion options must be reachable')
  assert.equal(result.reason, null, 'no pin_required notice for a configured PIN')
  assert.equal(result.requiresPin, true, 'but the PIN still has to be typed')
})

test('the card derives pinConfigured from the helper and verifies the PIN before revealing', () => {
  // Comments are allowed to name the old bug; only real code is inspected.
  const source = fs
    .readFileSync(CARD_PATH, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.ok(
    source.includes('pinConfiguredFromLockState(lockState)'),
    'the card must resolve the object state through the pure helper',
  )
  assert.ok(
    !/lockState\s+as\s+string/.test(source),
    'casting the object state to string is what produced the bug',
  )
  assert.ok(
    !/lockState\s*===\s*['"]activa['"]/.test(source),
    'activa is server vocabulary: resolveLockState never returns it as a lock state',
  )
  assert.ok(source.includes('verifyPin'), 'S15: the PIN is verified by the server before the UI opens')
  assert.ok(source.includes('PinKeypad'), 'the embedded PIN prompt reuses the shared keypad')
  assert.ok(source.includes('gate.requiresPin'), 'the card honours the requiresPin rule')
})
