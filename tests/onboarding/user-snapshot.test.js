// tests/onboarding/user-snapshot.test.js
// Exercises the real module (Node's type stripping handles the `.ts` import).
// The module is pure and takes the storage as a parameter, so no DOM is needed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readSnapshot,
  writeSnapshot,
  clearSnapshot,
  isPlainObject,
} from '../../src/lib/userSnapshot.ts'

const KEY = 'test_snapshot'

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map),
  }
}

function throwingStorage() {
  return {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('quota')
    },
    removeItem: () => {
      throw new Error('blocked')
    },
  }
}

const isText = (value) => typeof value === 'string'

test('round-trips a value for the same user', () => {
  const storage = fakeStorage()
  writeSnapshot(storage, KEY, 'user-a', 'ARS')
  assert.equal(readSnapshot(storage, KEY, 'user-a', isText), 'ARS')
})

test('round-trips an object value', () => {
  const storage = fakeStorage()
  const region = { countryCode: 'PY', localCurrency: 'PYG' }
  const isRegion = (v) =>
    isPlainObject(v) && typeof v.countryCode === 'string' && typeof v.localCurrency === 'string'
  writeSnapshot(storage, KEY, 'user-a', region)
  assert.deepEqual(readSnapshot(storage, KEY, 'user-a', isRegion), region)
})

test('refuses the snapshot of a different user on the same device', () => {
  const storage = fakeStorage()
  writeSnapshot(storage, KEY, 'user-a', 'ARS')
  assert.equal(readSnapshot(storage, KEY, 'user-b', isText), null)
})

test('refuses to read when there is no user yet', () => {
  const storage = fakeStorage()
  writeSnapshot(storage, KEY, 'user-a', 'ARS')
  assert.equal(readSnapshot(storage, KEY, null, isText), null)
  assert.equal(readSnapshot(storage, KEY, undefined, isText), null)
})

test('does not write without a user', () => {
  const storage = fakeStorage()
  writeSnapshot(storage, KEY, null, 'ARS')
  assert.deepEqual(storage._dump(), {})
})

test('rejects a value that fails the validator', () => {
  const storage = fakeStorage()
  writeSnapshot(storage, KEY, 'user-a', { nonsense: true })
  assert.equal(readSnapshot(storage, KEY, 'user-a', isText), null)
})

test('rejects corrupt JSON instead of throwing', () => {
  const storage = fakeStorage({ [KEY]: '{ not json' })
  assert.equal(readSnapshot(storage, KEY, 'user-a', isText), null)
})

test('rejects an envelope from another version', () => {
  const storage = fakeStorage({
    [KEY]: JSON.stringify({ userId: 'user-a', version: 0, value: 'ARS' }),
  })
  assert.equal(readSnapshot(storage, KEY, 'user-a', isText), null)
})

test('clear drops the snapshot for everyone', () => {
  const storage = fakeStorage()
  writeSnapshot(storage, KEY, 'user-a', 'ARS')
  clearSnapshot(storage, KEY)
  assert.equal(readSnapshot(storage, KEY, 'user-a', isText), null)
})

test('a blocked storage degrades to no snapshot and never throws', () => {
  const storage = throwingStorage()
  assert.doesNotThrow(() => writeSnapshot(storage, KEY, 'user-a', 'ARS'))
  assert.equal(readSnapshot(storage, KEY, 'user-a', isText), null)
  assert.doesNotThrow(() => clearSnapshot(storage, KEY))
})

test('a missing storage degrades to no snapshot', () => {
  assert.equal(readSnapshot(null, KEY, 'user-a', isText), null)
  assert.doesNotThrow(() => writeSnapshot(undefined, KEY, 'user-a', 'ARS'))
})

test('isPlainObject only accepts plain objects', () => {
  assert.equal(isPlainObject({}), true)
  assert.equal(isPlainObject([]), false)
  assert.equal(isPlainObject(null), false)
  assert.equal(isPlainObject('x'), false)
})
