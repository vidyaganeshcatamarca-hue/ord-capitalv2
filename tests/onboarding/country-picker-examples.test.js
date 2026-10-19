// tests/onboarding/country-picker-examples.test.js
// Owner tanda 4, bug 5: the wallet country picker opened as a blank box with a
// single "Buscar país" field. The owner wants five examples listed
// alphabetically, the five closest matches while typing, and copy that says what
// the picker is for ("Elige la moneda seleccionando el país de origen").
//
//   node --test tests/onboarding/country-picker-examples.test.js

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildCountryIndex, exampleCountries, searchCountries } from '../../src/lib/countryCatalog.ts'

const fixtures = [
  { code: 'CH', localCurrency: 'CHF', decimales: 2 },
  { code: 'AR', localCurrency: 'ARS', decimales: 2 },
  { code: 'BR', localCurrency: 'BRL', decimales: 2 },
  { code: 'DE', localCurrency: 'EUR', decimales: 2 },
  { code: 'GB', localCurrency: 'GBP', decimales: 2 },
  { code: 'US', localCurrency: 'USD', decimales: 2 },
  { code: 'JP', localCurrency: 'JPY', decimales: 0 },
]

const index = buildCountryIndex(fixtures)

test('an empty query offers five examples, alphabetically by localized name', () => {
  const examples = exampleCountries(index, 'es')
  assert.equal(examples.length, 5)
  const names = examples.map((c) => c.code)
  // de-DE-AR-BR-GB-JP-US sorted by Spanish name: Alemania, Argentina, Brasil,
  // Estados Unidos, Japón, Reino Unido, Suiza -> first five.
  assert.deepEqual(names, ['DE', 'AR', 'BR', 'US', 'JP'])
})

test('a smaller catalog yields what it has, never padding', () => {
  const small = buildCountryIndex(fixtures.slice(0, 2))
  assert.equal(exampleCountries(small, 'es').length, 2)
  assert.deepEqual(exampleCountries(buildCountryIndex([]), 'es'), [])
})

test('typing narrows the same list instead of starting from nothing', () => {
  const typed = searchCountries(index, 'br', 5)
  assert.equal(typed.length, 1)
  assert.equal(typed[0].code, 'BR')
})

test('the picker shows the examples and the purpose copy, capping both lists at five', () => {
  const src = fs.readFileSync(
    new URL('../../src/components/onboarding/CountrySearchModal.tsx', import.meta.url),
    'utf-8',
  )
  assert.match(src, /exampleCountries\(/, 'the empty state lists the alphabetical examples')
  assert.match(src, /searchCountries\(index,\s*query,\s*5\)/, 'live filtering returns the five closest matches')
  assert.match(src, /onboarding_country_picker_hint/, 'the picker states what it is for')

  const es = fs.readFileSync(new URL('../../src/locales/es.ts', import.meta.url), 'utf-8')
  assert.match(
    es,
    /onboarding_country_picker_hint:\s*"Elige la moneda seleccionando el país de origen\.?"/,
    'the owner copy is defined verbatim',
  )
})

// ── Owner tanda 5, bug 6: with the keyboard open the picker sat vertically
// centred, so only the first country was visible. It must hang from the top and
// cap its height with a dynamic viewport unit, otherwise the keyboard covers
// the list again on Android.

test('the picker hangs from the top and caps its height dynamically', () => {
  const src = fs.readFileSync(
    new URL('../../src/components/onboarding/CountrySearchModal.tsx', import.meta.url),
    'utf-8',
  )
  const overlay = src.slice(src.indexOf('const overlayStyle'), src.indexOf('const headerStyle'))
  assert.match(overlay, /alignItems:\s*'flex-start'/, 'the sheet must start at the top, not be centred')
  assert.doesNotMatch(overlay, /alignItems:\s*'center'/, 'centring is what hid the list behind the keyboard')

  const card = src.slice(src.indexOf('const cardStyle'), src.indexOf('const headerStyle'))
  assert.match(card, /dvh/, 'the height cap must use the dynamic viewport (keyboard aware)')
})

test('the example rows stay compact so five of them fit above the keyboard', () => {
  const src = fs.readFileSync(
    new URL('../../src/components/onboarding/CountrySearchModal.tsx', import.meta.url),
    'utf-8',
  )
  const row = src.slice(src.indexOf('const rowStyle'), src.indexOf('const emptyStyle'))
  const padding = /padding:\s*'(\d+)px (\d+)px'/.exec(row)
  assert.ok(padding, 'the row padding must be explicit')
  assert.ok(Number(padding[1]) <= 10, 'rows must be tight enough to show five examples')
})
