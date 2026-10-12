// tests/onboarding/country-suggestion.test.js
// Exercises the real module (Node's type stripping handles the `.ts` import).
// Pure logic, no DOM, no network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveCountrySuggestion,
  normalizeCountryCode,
} from '../../src/lib/countrySuggestion.ts'

test('web: the IP wins over a browser locale that points elsewhere', () => {
  // The reported case: a user in Argentina with Chrome configured as "Spanish
  // (Spain)". The locale says ES, the IP says AR, and AR is the truth.
  assert.deepEqual(
    resolveCountrySuggestion({ isNative: false, ipCountry: 'AR', deviceRegion: 'ES' }),
    { country: 'AR', source: 'ip' }
  )
})

test('web: falls back to the locale when there is no IP signal', () => {
  // Local development: Vercel does not set the geolocation headers.
  assert.deepEqual(
    resolveCountrySuggestion({ isNative: false, ipCountry: null, deviceRegion: 'ES' }),
    { country: 'ES', source: 'locale' }
  )
})

test('native: the device wins over the IP', () => {
  // Someone travelling: the phone is set to their home country, the IP is the hotel.
  assert.deepEqual(
    resolveCountrySuggestion({ isNative: true, ipCountry: 'AR', deviceRegion: 'ES' }),
    { country: 'ES', source: 'locale' }
  )
})

test('native: falls back to the IP when the device has no region', () => {
  assert.deepEqual(
    resolveCountrySuggestion({ isNative: true, ipCountry: 'PY', deviceRegion: null }),
    { country: 'PY', source: 'ip' }
  )
})

test('no signal at all means no suggestion, never a guess', () => {
  const expected = { country: null, source: 'none' }
  assert.deepEqual(resolveCountrySuggestion({ isNative: false }), expected)
  assert.deepEqual(resolveCountrySuggestion({ isNative: true }), expected)
  assert.deepEqual(
    resolveCountrySuggestion({ isNative: false, ipCountry: null, deviceRegion: null }),
    expected
  )
})

test('ignores nonsense instead of using it', () => {
  const expected = { country: null, source: 'none' }
  for (const bad of ['', '   ', 'ARG', 'ar-419', '12', 'A', undefined, null]) {
    assert.deepEqual(
      resolveCountrySuggestion({ isNative: false, ipCountry: bad, deviceRegion: bad }),
      expected,
      `expected no suggestion for ${JSON.stringify(bad)}`
    )
  }
})

test('normalizeCountryCode trims, uppercases and validates the shape', () => {
  assert.equal(normalizeCountryCode(' ar '), 'AR')
  assert.equal(normalizeCountryCode('Ar'), 'AR')
  assert.equal(normalizeCountryCode('ES'), 'ES')
  assert.equal(normalizeCountryCode('arg'), null)
  assert.equal(normalizeCountryCode(''), null)
  assert.equal(normalizeCountryCode(null), null)
  assert.equal(normalizeCountryCode(undefined), null)
})

test('an invalid IP does not block a valid locale, and vice versa', () => {
  assert.deepEqual(
    resolveCountrySuggestion({ isNative: false, ipCountry: 'nope', deviceRegion: 'py' }),
    { country: 'PY', source: 'locale' }
  )
  assert.deepEqual(
    resolveCountrySuggestion({ isNative: false, ipCountry: 'br', deviceRegion: 'nope' }),
    { country: 'BR', source: 'ip' }
  )
})
