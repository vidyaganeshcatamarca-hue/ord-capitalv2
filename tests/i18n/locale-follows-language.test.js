// tests/i18n/locale-follows-language.test.js
// The number and date formatting must follow the ACTIVE LANGUAGE, not a
// hardcoded Argentine locale.
//
// The app already resolves a locale from the user's language and country
// (`buildLocale(lang, countryCode)` -> `es-AR` / `en-US`). Before this
// feature, 28 call sites in 15 files ignored that and formatted with a
// literal `'es-AR'`, so an English user saw English text next to
// `$1.235` and `10 oct 2026`.
//
// What is locked here:
//   1. No `Intl` DISPLAY formatter in `src/` is pinned to a hardcoded locale.
//   2. The few locale literals that legitimately stay are registered with
//      the reason they exist, so a new one cannot appear by accident.
//   3. `buildLocale` maps a language to a sane locale for Intl.
//   4. The shared formatting context (`src/lib/format.ts`) follows the
//      language it is given.
//
//   node --test tests/i18n/locale-follows-language.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildLocale } from '../../src/lib/currencySymbol.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const SRC = path.join(ROOT, 'src')

/** Every .ts/.tsx file under src/. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const FILES = walk(SRC)
const relativeOf = (file) => path.relative(ROOT, file).split(path.sep).join('/')

/**
 * Files allowed to keep a hardcoded locale, with the reason. A file not
 * listed here must format through the resolved locale.
 *
 * These are NOT display formatters: they are language identifiers, backend
 * contracts, comparison collations, or documented default contexts.
 */
const ALLOWED_HARDCODED = new Map([
  [
    'src/voice/apiClient.ts',
    'the BCP-47 tag sent to the voice backend: the language the transcription model must use, not a display locale',
  ],
  [
    'src/pages/Reportes/ReportarProblemaPage.tsx',
    'the dev-only device locale picker of the report form',
  ],
  [
    'src/lib/format.ts',
    'the default format context, replaced as soon as the region resolves',
  ],
  [
    'src/lib/formatoMonedaLocal.ts',
    'the default locale argument, replaced as soon as the region resolves',
  ],
  [
    'src/lib/countryCatalog.ts',
    'the bilingual search index: names are indexed in BOTH languages so a country is findable either way',
  ],
  [
    'src/locales/language.ts',
    'the language catalogue itself: SUPPORTED, DEFAULT_LANG and the fallback chain',
  ],
])

/**
 * A locale literal handed to a DISPLAY formatter (currency, dates, collators).
 * This is what must follow the active language.
 */
const DISPLAY_LOCALE = new RegExp(
  [
    "new Intl\\.(?:NumberFormat|DateTimeFormat|Collator|RelativeTimeFormat|ListFormat)\\(\\s*'(?:es|en|pt|fr|de|it)(?:-[A-Za-z]{2,4})?'",
    "toLocale(?:Date|Time)?String\\(\\s*'(?:es|en|pt|fr|de|it)(?:-[A-Za-z]{2,4})?'",
    "\\.localeCompare\\([^)]*,\\s*'(?:es|en|pt|fr|de|it)(?:-[A-Za-z]{2,4})?'",
  ].join('|'),
  'g'
)

test('no Intl display formatter in src/ is pinned to a hardcoded locale', () => {
  const offenders = []

  for (const file of FILES) {
    const source = fs.readFileSync(file, 'utf-8')
    const relative = relativeOf(file)
    if (ALLOWED_HARDCODED.has(relative)) continue

    for (const match of source.matchAll(DISPLAY_LOCALE)) {
      const line = source.slice(0, match.index).split('\n').length
      offenders.push(`${relative}:${line} -> ${match[0].slice(0, 90)}`)
    }
  }

  assert.equal(
    offenders.length,
    0,
    `hardcoded display locales left in src/:\n` + offenders.join('\n')
  )
})

test('buildLocale maps the active language to the display locale', () => {
  assert.equal(buildLocale('es', 'AR'), 'es-AR')
  assert.equal(buildLocale('en', 'US'), 'en-US')
  assert.equal(buildLocale('en', 'AR'), 'en-AR')
  assert.equal(buildLocale('es', null), 'es')
  assert.equal(buildLocale('en', undefined), 'en')
  // A malformed language falls back to Spanish, never to a broken tag.
  assert.equal(buildLocale('12', 'AR'), 'es-AR')
  assert.equal(buildLocale('', 'AR'), 'es-AR')
})

test('the shared format context follows the language it is given', async () => {
  const { setFormatContext, formatCurrency, formatDate } = await import('../../src/lib/format.ts')

  // S21 (2026-10-23): los separadores ya no los decide el locale sino la
  // configuración regional, así que acá se publican los dos juntos: el locale
  // aporta idioma, símbolo y posición; los separadores, la preferencia del
  // usuario. En producción `useNumberFormat` publica siempre ambos.
  setFormatContext({
    locale: 'en-US',
    localCurrency: 'USD',
    decimalsLocal: 2,
    decimalsSecondary: 2,
    decimalSeparator: '.',
    thousandSeparator: ',',
    currencyFormats: {},
  })
  const english = formatCurrency(1234.5)
  assert.ok(
    english.includes('1,234.50'),
    `English locale must group with commas and use a dot decimal: ${english}`
  )

  setFormatContext({
    locale: 'es-AR',
    localCurrency: 'ARS',
    decimalsLocal: 2,
    decimalsSecondary: 2,
    decimalSeparator: ',',
    thousandSeparator: '.',
    currencyFormats: {},
  })
  const spanish = formatCurrency(1234.5)
  assert.ok(
    spanish.includes('1.234,50'),
    `Argentine locale must group with dots and use a comma decimal: ${spanish}`
  )

  // Los separadores mandan aunque el locale no coincida: es la regla del dueño
  // (una sola elección regional para todas las monedas).
  setFormatContext({ locale: 'en-US', decimalSeparator: ',', thousandSeparator: '.' })
  assert.ok(
    formatCurrency(1234.5).includes('1.234,50'),
    `la preferencia regional gana sobre el locale: ${formatCurrency(1234.5)}`
  )

  // The date follows the same context.
  setFormatContext({ locale: 'en-US' })
  const englishDate = formatDate('2026-10-10')
  assert.ok(
    /Oct/.test(englishDate),
    `English date must use the English month name: ${englishDate}`
  )

  setFormatContext({ locale: 'es-AR' })
  const spanishDate = formatDate('2026-10-10')
  assert.ok(
    /oct/i.test(spanishDate),
    `Spanish date must use the Spanish month name: ${spanishDate}`
  )
})
