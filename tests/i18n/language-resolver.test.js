// tests/i18n/language-resolver.test.js
// Locale parsing and language resolution precedence.
//
//   node --test tests/i18n/language-resolver.test.js
//
// This imports the real module with Node's type stripping, which works only
// because src/locales/language.ts has no imports of its own: a relative
// `.js`-to-`.ts` import would resolve fine under Vite and fail here.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  SUPPORTED,
  DEFAULT_LANG,
  isSupported,
  normalizeLocale,
  parseDeviceLocales,
  resolveRegionFromLocale,
  resolveLanguage,
  fallbackChain,
} from '../../src/locales/language.ts'

test('SUPPORTED stays a non-empty list of unique lowercase tags', () => {
  assert.ok(SUPPORTED.length > 0, 'SUPPORTED must ship at least one language')
  for (const lang of SUPPORTED) {
    assert.match(lang, /^[a-z]{2}$/, `SUPPORTED entry "${lang}" must be a lowercase 2-letter tag`)
  }
  assert.equal(new Set(SUPPORTED).size, SUPPORTED.length, 'SUPPORTED must not repeat a language')
  assert.ok(SUPPORTED.includes(DEFAULT_LANG), 'DEFAULT_LANG must be one of SUPPORTED')
})

test('normalizeLocale splits language and region', () => {
  assert.deepEqual(normalizeLocale('es-PY'), { language: 'es', region: 'PY' })
  assert.deepEqual(normalizeLocale('pt-BR'), { language: 'pt', region: 'BR' })
  assert.deepEqual(normalizeLocale('en'), { language: 'en', region: null })
})

test('normalizeLocale accepts the underscore separator', () => {
  assert.deepEqual(normalizeLocale('es_PY'), { language: 'es', region: 'PY' })
})

test('normalizeLocale skips script and numeric subtags', () => {
  assert.deepEqual(normalizeLocale('zh-Hant-TW'), { language: 'zh', region: 'TW' })
  assert.deepEqual(normalizeLocale('es-419'), { language: 'es', region: null })
})

test('normalizeLocale tolerates empty input', () => {
  assert.deepEqual(normalizeLocale(''), { language: '', region: null })
})

test('parseDeviceLocales keeps the browser preference order', () => {
  assert.deepEqual(parseDeviceLocales(['es-PY', 'en-US', 'es']), ['es-PY', 'en-US', 'es'])
})

test('parseDeviceLocales accepts a bare string', () => {
  assert.deepEqual(parseDeviceLocales('es-PY'), ['es-PY'])
  assert.deepEqual(parseDeviceLocales('es_PY'), ['es-PY'])
})

test('parseDeviceLocales returns an empty list for undefined or junk', () => {
  assert.deepEqual(parseDeviceLocales(undefined), [])
  assert.deepEqual(parseDeviceLocales(null), [])
  assert.deepEqual(parseDeviceLocales(''), [])
  assert.deepEqual(parseDeviceLocales(42), [])
})

test('parseDeviceLocales drops duplicates without reordering', () => {
  assert.deepEqual(parseDeviceLocales(['es-PY', 'es_PY', 'en-US', 'es-py']), ['es-PY', 'en-US'])
})

test('parseDeviceLocales ignores non-string entries in an array', () => {
  assert.deepEqual(parseDeviceLocales([1, 'es-ES', null, undefined]), ['es-ES'])
})

test('resolveRegionFromLocale reads the region of the first locale that has one', () => {
  assert.equal(resolveRegionFromLocale(['es-PY']), 'PY')
  assert.equal(resolveRegionFromLocale(['es-ES']), 'ES')
  assert.equal(resolveRegionFromLocale(['en-US', 'pt-BR']), 'US')
  assert.equal(resolveRegionFromLocale(['en', 'es-PY']), 'PY')
})

test('resolveRegionFromLocale returns null when there is no region signal', () => {
  assert.equal(resolveRegionFromLocale(['en']), null)
  assert.equal(resolveRegionFromLocale([]), null)
  assert.equal(resolveRegionFromLocale(['es-419']), null)
})

test('resolveLanguage prefers the stored preference over the device locale', () => {
  // A device-first resolver would report 'device' here: this is the
  // regression the PRD pseudocode had.
  assert.deepEqual(
    resolveLanguage({ stored: 'es', deviceLocales: ['es-ES'] }),
    { lang: 'es', source: 'stored' }
  )
})

test('resolveLanguage falls back to the device locale when nothing is stored', () => {
  assert.deepEqual(
    resolveLanguage({ stored: null, deviceLocales: ['es-ES'] }),
    { lang: 'es', source: 'device' }
  )
})

test('resolveLanguage ignores an unsupported stored value', () => {
  assert.deepEqual(
    resolveLanguage({ stored: 'fr', deviceLocales: ['es-PY'] }),
    { lang: 'es', source: 'device' }
  )
})

test('resolveLanguage reads device locales in preference order', () => {
  assert.deepEqual(
    resolveLanguage({ deviceLocales: ['fr-FR', 'en-US', 'es-PY'] }),
    { lang: 'es', source: 'device' }
  )
})

test('resolveLanguage prefers the device locale over the country suggestion', () => {
  assert.deepEqual(
    resolveLanguage({ deviceLocales: ['es-PY'], countrySuggested: 'es' }),
    { lang: 'es', source: 'device' }
  )
})

test('resolveLanguage uses the country suggestion when the device has nothing usable', () => {
  assert.deepEqual(
    resolveLanguage({ stored: 'en', deviceLocales: ['fr-FR'], countrySuggested: 'es' }),
    { lang: 'es', source: 'country' }
  )
})

test('resolveLanguage ends at DEFAULT_LANG when no signal is supported', () => {
  assert.deepEqual(resolveLanguage({}), { lang: DEFAULT_LANG, source: 'default' })
  assert.deepEqual(
    resolveLanguage({ stored: 'en', deviceLocales: ['fr-FR'], countrySuggested: 'de' }),
    { lang: DEFAULT_LANG, source: 'default' }
  )
})

test('isSupported narrows to the shipped languages only', () => {
  assert.equal(isSupported('es'), true)
  assert.equal(isSupported('en'), false)
  assert.equal(isSupported('ES'), false)
  assert.equal(isSupported(''), false)
  assert.equal(isSupported(null), false)
  assert.equal(isSupported(undefined), false)
})

test('fallbackChain starts at the requested language and ends at DEFAULT_LANG', () => {
  assert.deepEqual(fallbackChain('es'), ['es'])
  assert.deepEqual(fallbackChain('en'), ['es'])
  assert.deepEqual(fallbackChain('zz'), ['es'])
  assert.deepEqual(fallbackChain(''), ['es'])
})

test('fallbackChain never repeats a language', () => {
  for (const lang of [...SUPPORTED, 'en', '', 'zz']) {
    const chain = fallbackChain(lang)
    assert.equal(new Set(chain).size, chain.length, `fallbackChain(${lang}) has duplicates`)
    assert.equal(chain[chain.length - 1], DEFAULT_LANG)
  }
})
