// tests/onboarding/currency-symbol.test.js
// Currency symbol, position and locale resolution for the regional catalog.
//
//   node --test tests/onboarding/currency-symbol.test.js
//
// This imports the real module with Node's type stripping, which works only
// because src/lib/currencySymbol.ts has no imports of its own: a relative
// `.js`-to-`.ts` import would resolve under Vite and fail here.
//
// The expected symbols come from Intl with full ICU (the Node default since
// v13). The whole point of the module is that ARS and USD must NOT collapse to
// the same `$` literal the app used to hardcode.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveCurrencySymbol,
  currencySymbolPosition,
  buildLocale,
} from '../../src/lib/currencySymbol.ts'

test('resolveCurrencySymbol reads the symbol from the specific locale (ARS/es-AR -> $)', () => {
  assert.equal(resolveCurrencySymbol('ARS', 'es-AR'), '$')
})

test('resolveCurrencySymbol distinguishes USD from ARS in es-AR (USD -> US$)', () => {
  // This is the ambiguity the hardcoded `$` used to hide.
  assert.equal(resolveCurrencySymbol('USD', 'es-AR'), 'US$')
})

test('resolveCurrencySymbol resolves EUR in es-ES and PYG in es-PY', () => {
  assert.equal(resolveCurrencySymbol('EUR', 'es-ES'), '€')
  assert.equal(resolveCurrencySymbol('PYG', 'es-PY'), 'Gs.')
})

test('resolveCurrencySymbol uppercases and trims the code', () => {
  assert.equal(resolveCurrencySymbol(' ars ', 'es-AR'), '$')
})

test('resolveCurrencySymbol falls back to the catalog symbol when Intl has no data', () => {
  // An invalid ISO 4217 code makes Intl throw; the catalog symbol wins.
  assert.equal(resolveCurrencySymbol('NOT_A_CURRENCY', 'es-AR', '₲'), '₲')
})

test('resolveCurrencySymbol returns the code when Intl fails and there is no fallback', () => {
  assert.equal(resolveCurrencySymbol('XX', 'es-AR'), 'XX')
  assert.equal(resolveCurrencySymbol('XX', 'not-a-locale'), 'XX')
})

test('resolveCurrencySymbol never throws on invalid input', () => {
  assert.doesNotThrow(() => resolveCurrencySymbol('', ''))
  assert.equal(resolveCurrencySymbol('', ''), '')
})

test('resolveCurrencySymbol treats a blank fallback as absent', () => {
  assert.equal(resolveCurrencySymbol('XX', 'es-AR', '   '), 'XX')
})

test('currencySymbolPosition places ARS before the number in es-AR', () => {
  assert.equal(currencySymbolPosition('ARS', 'es-AR'), 'before')
})

test('currencySymbolPosition places EUR after the number in es-ES', () => {
  assert.equal(currencySymbolPosition('EUR', 'es-ES'), 'after')
})

test('currencySymbolPosition defaults to before on invalid input', () => {
  assert.equal(currencySymbolPosition('XX', 'es-AR'), 'before')
})

test('buildLocale combines language and region (es + AR -> es-AR)', () => {
  assert.equal(buildLocale('es', 'AR'), 'es-AR')
})

test('buildLocale normalizes casing and whitespace', () => {
  assert.equal(buildLocale('ES', ' ar '), 'es-AR')
})

test('buildLocale drops the region when it is missing', () => {
  assert.equal(buildLocale('es', null), 'es')
  assert.equal(buildLocale('es', undefined), 'es')
  assert.equal(buildLocale('es', ''), 'es')
})

test('buildLocale falls back to es on malformed input without throwing', () => {
  assert.equal(buildLocale('', ''), 'es')
  assert.equal(buildLocale('not-a-language', 'AR'), 'es-AR')
  assert.equal(buildLocale('es', 'ZZZZ'), 'es')
  assert.equal(buildLocale(undefined, null), 'es')
})

test('the symbol of a currency is not always the hardcoded $', () => {
  // The regression that motivated the module: ARS and USD must differ.
  assert.notEqual(resolveCurrencySymbol('ARS', 'es-AR'), resolveCurrencySymbol('USD', 'es-AR'))
  assert.notEqual(resolveCurrencySymbol('ARS', 'es-AR'), 'U$S')
})

test('an EUR user and an ARS user get different symbol positions and symbols', () => {
  const arsSymbol = resolveCurrencySymbol('ARS', 'es-AR')
  const eurSymbol = resolveCurrencySymbol('EUR', 'es-ES')
  assert.equal(currencySymbolPosition('ARS', 'es-AR'), 'before')
  assert.equal(currencySymbolPosition('EUR', 'es-ES'), 'after')
  assert.notEqual(arsSymbol, eurSymbol)
})
