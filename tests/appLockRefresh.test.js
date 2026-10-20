// tests/appLockRefresh.test.js
// App-lock: a STATUS refresh must not re-arm the lock after a successful
// resolution (owner tanda 4, bug 1: "lo destraba y vuelve a trabarlo").
//
//   node --test tests/appLockRefresh.test.js
//
// Root cause being pinned: verifyPin/definePin/unlockWithBiometria set
// locked=false and then refreshed the server status; the refresh mapped
// estado='activa' back to locked=true, so the overlay reappeared at once and
// the user could never get past it.
//
// Two layers asserted:
//   1. the pure policy helper (src/lib/appLock.ts owns the policy);
//   2. the call sites in the context, so a future refactor cannot silently
//      refresh with the arming mode again.

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { statusRefreshArmsLock } from '../src/lib/appLock.ts'

test('arming refresh locks while the PIN is active', () => {
  assert.equal(statusRefreshArmsLock('arm', 'activa'), true)
  assert.equal(statusRefreshArmsLock('arm', 'en_cooldown'), true)
})

test('arming refresh never locks without an enforcing PIN', () => {
  assert.equal(statusRefreshArmsLock('arm', 'sin_pin'), false)
  assert.equal(statusRefreshArmsLock('arm', 'restaurar'), false)
  assert.equal(statusRefreshArmsLock('arm', null), false)
  assert.equal(statusRefreshArmsLock('arm', 'basura'), false)
})

test('silent refresh never locks, whatever the server state says', () => {
  assert.equal(statusRefreshArmsLock('silent', 'activa'), false)
  assert.equal(statusRefreshArmsLock('silent', 'en_cooldown'), false)
  assert.equal(statusRefreshArmsLock('silent', 'sin_pin'), false)
})

test('every post-resolution status refresh is silent (context contract)', () => {
  const ctx = fs.readFileSync(new URL('../src/contexts/AppLockContext.tsx', import.meta.url), 'utf-8')

  // Cold start still arms: the mount effect must not be silent.
  assert.match(ctx, /refreshStatus\(\{\s*mode:\s*'arm'\s*\}\)/, 'mount refresh arms the lock')

  // Each successful resolution refreshes without arming. verifyPin/definePin
  // also drop the overlay explicitly; deactivatePin ends with estado='sin_pin'
  // (the gate renders nothing in that state).
  const resolutions = [
    { fn: 'verifyPin', unlocksExplicitly: true },
    { fn: 'definePin', unlocksExplicitly: true },
    { fn: 'deactivatePin', unlocksExplicitly: false },
    // unlockWithBiometria was removed in tanda 12 (PIN-only lock).
  ]
  for (const { fn, unlocksExplicitly } of resolutions) {
    const start = ctx.indexOf(`const ${fn} = useCallback`)
    assert.ok(start > -1, `${fn} must exist`)
    const end = ctx.indexOf('}, [session', start)
    const body = ctx.slice(start, end)
    const silent = /refreshStatus\(\{\s*mode:\s*'silent'\s*\}\)/.exec(body)
    assert.ok(silent, `${fn} refreshes silently after resolving`)
    if (unlocksExplicitly) {
      assert.ok(body.indexOf('setLocked(false)') > -1, `${fn} drops the overlay`)
      assert.ok(body.indexOf('setLocked(false)') < silent.index, `${fn} drops the overlay before refreshing`)
    }
    assert.equal((body.match(/refreshStatus\(\s*\)/g) ?? []).length, 0, `${fn} never refreshes with an implicit mode`)
  }
})
