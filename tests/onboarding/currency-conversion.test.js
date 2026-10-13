// tests/onboarding/currency-conversion.test.js
// Exercises the real module (Node's type stripping handles the `.ts` import).
//
// The bug this protects against: a transfer of 100 EUR to a USD wallet showed the
// destination amount field EMPTY because the suggestion hardcoded 'ARS'. The math was
// always right for any local currency; the guard was not.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestDestinationAmount } from '../../src/lib/currencyConversion.ts'

const ARS = 1515.8766 // local currency units per USD
const EUR = 0.8926

const input = (over) => ({
  amount: 100,
  originCurrency: null,
  destinationCurrency: null,
  localCurrency: null,
  usdRate: null,
  ...over,
})

test('ARS to USD divides by the rate', () => {
  const out = suggestDestinationAmount(
    input({ originCurrency: 'ARS', destinationCurrency: 'USD', localCurrency: 'ARS', usdRate: ARS })
  )
  assert.equal(out, Math.round((100 / ARS) * 100) / 100)
  assert.ok(out > 0 && out < 1)
})

test('USD to ARS multiplies by the rate', () => {
  const out = suggestDestinationAmount(
    input({ originCurrency: 'USD', destinationCurrency: 'ARS', localCurrency: 'ARS', usdRate: ARS })
  )
  assert.equal(out, Math.round(100 * ARS * 100) / 100)
})

test('EUR to USD works: this is the case that was broken', () => {
  const out = suggestDestinationAmount(
    input({ originCurrency: 'EUR', destinationCurrency: 'USD', localCurrency: 'EUR', usdRate: EUR })
  )
  // 100 EUR / 0.8926 EUR per USD ≈ 112.03 USD
  assert.equal(out, 112.03)
})

test('USD to EUR works in the other direction', () => {
  const out = suggestDestinationAmount(
    input({ originCurrency: 'USD', destinationCurrency: 'EUR', localCurrency: 'EUR', usdRate: EUR })
  )
  assert.equal(out, 89.26)
})

test('PYG to USD: a zero-decimal currency is handled the same way', () => {
  const out = suggestDestinationAmount(
    input({ amount: 500000, originCurrency: 'PYG', destinationCurrency: 'USD', localCurrency: 'PYG', usdRate: 7300 })
  )
  assert.equal(out, 68.49)
})

test('round-trips back to the original amount', () => {
  const toUsd = suggestDestinationAmount(
    input({ originCurrency: 'EUR', destinationCurrency: 'USD', localCurrency: 'EUR', usdRate: EUR })
  )
  const back = suggestDestinationAmount(
    input({ amount: toUsd, originCurrency: 'USD', destinationCurrency: 'EUR', localCurrency: 'EUR', usdRate: EUR })
  )
  assert.ok(Math.abs(back - 100) <= 0.05, `esperaba ~100 y vino ${back}`)
})

test('refuses a pair we have no rate for instead of inventing a number', () => {
  // ARS to EUR for a Spanish user: that needs a cross rate the app does not have.
  assert.equal(
    suggestDestinationAmount(
      input({ originCurrency: 'ARS', destinationCurrency: 'EUR', localCurrency: 'EUR', usdRate: EUR })
    ),
    null
  )
})

test('returns null instead of a suggestion when it has no basis', () => {
  const base = { originCurrency: 'EUR', destinationCurrency: 'USD', localCurrency: 'EUR', usdRate: EUR }
  assert.equal(suggestDestinationAmount(input({ ...base, usdRate: null })), null, 'sin cotizacion')
  assert.equal(suggestDestinationAmount(input({ ...base, usdRate: 0 })), null, 'cotizacion en cero')
  assert.equal(suggestDestinationAmount(input({ ...base, localCurrency: null })), null, 'sin moneda local')
  assert.equal(suggestDestinationAmount(input({ ...base, originCurrency: null })), null, 'sin moneda origen')
  assert.equal(suggestDestinationAmount(input({ ...base, destinationCurrency: null })), null, 'sin moneda destino')
  assert.equal(suggestDestinationAmount(input({ ...base, amount: 0 })), null, 'monto cero')
  assert.equal(suggestDestinationAmount(input({ ...base, amount: Number.NaN })), null, 'monto invalido')
})

test('same currency needs no conversion', () => {
  assert.equal(
    suggestDestinationAmount(
      input({ originCurrency: 'EUR', destinationCurrency: 'EUR', localCurrency: 'EUR', usdRate: EUR })
    ),
    null
  )
})

test('tolerates lowercase and padded codes', () => {
  const out = suggestDestinationAmount(
    input({ originCurrency: ' eur ', destinationCurrency: 'usd', localCurrency: 'EUR', usdRate: EUR })
  )
  assert.equal(out, 112.03)
})
