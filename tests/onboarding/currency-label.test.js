// tests/onboarding/currency-label.test.js
// ========================================
// Tanda 3: currency labels in option lists and selection inputs. The owner's
// engine without full ICU resolves BOB as 'BOB' (the code itself), and the
// 'BOB · BOB' / 'BOB (BOB)' label is what he circled. Rule: when the resolved
// name adds nothing (equals the code), the label is JUST the code; never
// duplicated.
import test from 'node:test'
import assert from 'node:assert/strict'
import { formatCurrencyLabel } from '../../src/lib/monedasExtra.ts'

test('normal: name differs from code -> name + code joined', () => {
  assert.equal(formatCurrencyLabel('franco suizo', 'CHF', '·'), 'franco suizo · CHF')
  assert.equal(formatCurrencyLabel('boliviano', 'BOB', '·'), 'boliviano · BOB')
})

test('name == code (engine without locale data) -> code only, no duplication', () => {
  assert.equal(formatCurrencyLabel('BOB', 'BOB', '·'), 'BOB')
  assert.equal(formatCurrencyLabel('AED', 'AED', '·'), 'AED')
})

test('works with the Billeteras parentheses separator', () => {
  assert.equal(formatCurrencyLabel('dólar estadounidense', 'USD', 'parens'), 'dólar estadounidense (USD)')
  assert.equal(formatCurrencyLabel('BOB', 'BOB', 'parens'), 'BOB')
})

test('dirty inputs: spaces, lowercase, empty', () => {
  assert.equal(formatCurrencyLabel('  boliviano ', ' bob ', '·'), 'boliviano · BOB')
  assert.equal(formatCurrencyLabel('', 'BOB', '·'), 'BOB')
  assert.equal(formatCurrencyLabel('BOB', '', '·'), 'BOB')
  assert.equal(formatCurrencyLabel(null, null, 'parens'), '')
})