// tests/onboarding/country-catalog.test.js
// Country catalog normalization, search index and regional defaults.
//
//   node --test tests/onboarding/country-catalog.test.js
//
// This imports the real module with Node's type stripping, which works only
// because src/lib/countryCatalog.ts has no imports of its own: a relative
// `.js`-to-`.ts` import would resolve fine under Vite and fail here.
//
// The search tests read the Spanish and English names from Intl.DisplayNames,
// so they need a Node build with full ICU (the default since v13).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeCountryRow,
  deaccent,
  buildCountryIndex,
  searchCountries,
  findCountry,
  regionalDefaults,
  regionName,
  currencyName,
  flagEmoji,
} from '../../src/lib/countryCatalog.ts'

/** Raw PostgREST row shape, with char(n) padding and numeric strings. */
function rawRow(overrides = {}) {
  return {
    codigo: 'PY',
    moneda_local: 'PYG',
    moneda_decimales: '0',
    moneda_simbolo: '₲',
    idioma_sugerido: 'es',
    separador_miles: '.',
    separador_decimal: ',',
    primer_dia_semana: '1',
    formato_fecha: 'DD/MM/YYYY',
    formato_hora: '24h',
    orden: '1',
    ...overrides,
  }
}

test('normalizeCountryRow trims char(n) padding and coerces numeric strings', () => {
  const country = normalizeCountryRow(
    rawRow({
      codigo: ' py',
      moneda_local: 'PYG ',
      idioma_sugerido: 'ES ',
      moneda_decimales: '0',
      primer_dia_semana: '1',
      orden: '42',
    })
  )

  assert.equal(country.code, 'PY')
  assert.equal(country.localCurrency, 'PYG')
  assert.equal(country.suggestedLanguage, 'es')
  assert.equal(country.currencyDecimals, 0)
  assert.equal(country.firstDayOfWeek, 1)
  assert.equal(country.order, 42)
  assert.equal(country.dateFormat, 'DD/MM/YYYY')
  assert.equal(country.timeFormat, '24h')
})

test('normalizeCountryRow keeps a space thousands separator intact', () => {
  // `separador_miles` is text: trimming it would destroy a legitimate space.
  const country = normalizeCountryRow(rawRow({ separador_miles: ' ' }))
  assert.equal(country.thousandsSeparator, ' ')
})

test('normalizeCountryRow falls back instead of leaking NaN', () => {
  const country = normalizeCountryRow({ codigo: 'US', moneda_local: 'USD' })
  assert.equal(country.currencyDecimals, 2)
  assert.equal(country.firstDayOfWeek, 1)
  assert.ok(Number.isFinite(country.order), 'order must stay a finite number')
})

test('deaccent strips diacritics', () => {
  assert.equal(deaccent('México'), 'Mexico')
  assert.equal(deaccent('Perú'), 'Peru')
  assert.equal(deaccent('España'), 'Espana')
  assert.equal(deaccent('Paraguay'), 'Paraguay')
})

const CODES = [
  'AR', 'DE', 'MX', 'PE', 'PY', 'US', 'ES', 'IN', 'BR',
  'CL', 'CA', 'FR', 'IT', 'JP', 'CN', 'NL', 'PT',
]

const index = buildCountryIndex(
  CODES.map((code) =>
    normalizeCountryRow(
      rawRow({
        codigo: code,
        moneda_local: code === 'PY' ? 'PYG' : code === 'ES' ? 'EUR' : 'USD',
        orden: String(CODES.indexOf(code) + 1),
      })
    )
  )
)

test('the index exposes every country by code', () => {
  assert.equal(index.countries.length, CODES.length)
  assert.ok(findCountry(index, 'PY'))
})

test('searchCountries returns nothing until the user types', () => {
  assert.deepEqual(searchCountries(index, ''), [])
  assert.deepEqual(searchCountries(index, '   '), [])
})

test('searchCountries matches the English name (Germany -> DE)', () => {
  const results = searchCountries(index, 'Germany')
  assert.equal(results.length, 1)
  assert.equal(results[0].code, 'DE')
})

test('searchCountries matches the Spanish name, with or without accents (Mexico -> MX)', () => {
  assert.equal(searchCountries(index, 'Mexico')[0]?.code, 'MX')
  assert.equal(searchCountries(index, 'México')[0]?.code, 'MX')
})

test('searchCountries matches the ISO code (PY -> Paraguay)', () => {
  assert.equal(searchCountries(index, 'PY')[0]?.code, 'PY')
})

test('searchCountries ignores diacritics in the query (peru -> PE)', () => {
  assert.equal(searchCountries(index, 'peru')[0]?.code, 'PE')
})

test('searchCountries ranks prefix matches before substring matches', () => {
  // "in" prefixes India (IN) and appears inside Argentina (AR).
  const results = searchCountries(index, 'in')
  assert.ok(results.length >= 2, 'both India and Argentina must match')
  assert.equal(results[0].code, 'IN')
  assert.ok(results.some((country) => country.code === 'AR'))
})

test('searchCountries respects the limit', () => {
  const all = searchCountries(index, 'a')
  assert.equal(all.length, 8, 'default limit is 8')
  assert.equal(searchCountries(index, 'a', 3).length, 3)
})

test('findCountry is case-insensitive and tolerates whitespace', () => {
  assert.equal(findCountry(index, 'de')?.code, 'DE')
  assert.equal(findCountry(index, ' DE ')?.code, 'DE')
  assert.equal(findCountry(index, 'zz'), null)
  assert.equal(findCountry(index, ''), null)
})

test('regionalDefaults maps the catalog fields to the persisted shape', () => {
  const country = normalizeCountryRow(
    rawRow({
      moneda_decimales: '0',
      separador_miles: '.',
      separador_decimal: ',',
      primer_dia_semana: '1',
      formato_fecha: 'DD/MM/YYYY',
      formato_hora: '24h',
    })
  )

  assert.deepEqual(regionalDefaults(country), {
    decimales: 0,
    separadorMiles: '.',
    separadorDecimal: ',',
    primerDiaSemana: 1,
    formatoFecha: 'DD/MM/YYYY',
    formatoHora: '24h',
  })
})

test('regionName and currencyName return a non-empty label and tolerate bad input', () => {
  assert.ok(regionName('PY', 'es').length > 0)
  assert.ok(currencyName('PYG', 'es').length > 0)
  assert.equal(regionName('', 'es'), '')
  assert.equal(currencyName('', 'es'), '')
})

test('flagEmoji derives the flag from the code and rejects bad input', () => {
  const paraguay = String.fromCodePoint(0x1f1f5, 0x1f1fe)
  assert.equal(flagEmoji('PY'), paraguay)
  assert.equal(flagEmoji('py'), paraguay)
  assert.equal(flagEmoji(''), '')
  assert.equal(flagEmoji('XYZ'), '')
})
