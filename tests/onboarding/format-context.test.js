// tests/onboarding/format-context.test.js
// `lib/format.ts` is used by ~22 files and used to be nailed to Argentina: locale
// 'es-AR', 0 decimals always, 'ARS' by default. These tests pin the new behaviour and,
// just as important, pin that the DEFAULT is still what it always was.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  setFormatContext,
  getFormatContext,
  formatCurrency,
  formatNumber,
} from '../../src/lib/format.ts'

/** Intl uses non-breaking spaces; normalise so assertions read naturally. */
const norm = (s) => String(s).replace(/[\u00A0\u202F\u2009]/g, ' ')

test('the default context is the historical Argentine one', () => {
  // A fresh module starts with the previous behaviour, so nothing changes for the
  // existing base until the region resolves.
  const ctx = getFormatContext()
  assert.equal(ctx.locale, 'es-AR')
  assert.equal(ctx.localCurrency, 'ARS')
  assert.equal(ctx.decimalsLocal, 0)
  assert.equal(ctx.decimalsSecondary, 1)
})

test('with no currency argument it formats the LOCAL currency, not ARS', () => {
  setFormatContext({
    locale: 'es-ES',
    localCurrency: 'EUR',
    decimalsLocal: 2,
    decimalsSecondary: 2,
  })
  // 5 digits on purpose: Spanish (es-ES) does not group 4-digit numbers, so 1234.5
  // formats as "1234,50 EUR" with no thousands separator. That is correct CLDR
  // behaviour, not a bug.
  const out = norm(formatCurrency(12345.5))
  assert.ok(out.includes('12.345,50'), `esperaba el monto con 2 decimales, vino ${out}`)
  assert.ok(out.includes('€'), `esperaba el simbolo del euro, vino ${out}`)
  assert.ok(!out.includes('$'), `no deberia haber simbolo de peso: ${out}`)
})

test('the second currency (USD) uses its own decimals', () => {
  setFormatContext({
    locale: 'es-AR',
    localCurrency: 'ARS',
    decimalsLocal: 0,
    decimalsSecondary: 2,
  })
  const out = norm(formatCurrency(1234.5, 'USD'))
  assert.ok(out.includes('1.234,50'), `esperaba 2 decimales para USD, vino ${out}`)
})

test('zero-decimal currencies stay with no decimals', () => {
  setFormatContext({
    locale: 'es-PY',
    localCurrency: 'PYG',
    decimalsLocal: 0,
    decimalsSecondary: 2,
  })
  const out = norm(formatCurrency(1234.5))
  assert.ok(out.includes('1.235'), `esperaba el redondeo de PYG, vino ${out}`)
})

test('an explicit currency wins over the local one', () => {
  setFormatContext({ locale: 'es-ES', localCurrency: 'EUR', decimalsLocal: 2, decimalsSecondary: 2 })
  const out = norm(formatCurrency(100, 'USD'))
  assert.ok(out.includes('100,00'), out)
})

test('an unknown currency code does not break the screen', () => {
  setFormatContext({ locale: 'es-AR', localCurrency: 'ARS', decimalsLocal: 0, decimalsSecondary: 1 })
  assert.doesNotThrow(() => formatCurrency(100, 'ZZZ'))
})

test('a non-numeric amount is a dash, not a crash', () => {
  assert.equal(formatCurrency('no es un numero'), '-')
  // null goes through `Number(null) === 0` and formats as zero; undefined becomes NaN
  // and is a dash. Both are the previous behaviour, and changing them here would alter
  // what screens show today, which is not this slice's business.
  assert.equal(norm(formatCurrency(null)), norm(formatCurrency(0)))
  assert.equal(formatCurrency(undefined), '-')
})

test('formatNumber keeps its own rule: no decimals', () => {
  setFormatContext({ locale: 'es-ES', localCurrency: 'EUR', decimalsLocal: 2, decimalsSecondary: 2 })
  const out = norm(formatNumber(1234.5))
  assert.ok(!out.includes(','), `los conteos no llevan decimales: ${out}`)
})

test('lowercase and padded currency codes are accepted', () => {
  setFormatContext({ locale: 'es-ES', localCurrency: 'EUR', decimalsLocal: 2, decimalsSecondary: 2 })
  assert.equal(norm(formatCurrency(100, ' usd ')), norm(formatCurrency(100, 'USD')))
})
