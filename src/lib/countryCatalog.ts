// lib/countryCatalog.ts
// ============================================
// Country catalog — pure logic, ZERO imports.
//
// The Node test runner imports this module directly with its type stripping
// (`import { ... } from '../../src/lib/countryCatalog.ts'`). It cannot resolve
// Vite aliases (`@/...`) nor `.js`-to-`.ts` rewrites, so this file must stay
// free of every import. Keep React, the DOM and Supabase out of here.
//
// The catalog itself lives in Supabase (`fn_obtener_paises()`). This module
// only normalizes and indexes whatever the RPC returned: there is no embedded
// snapshot and no invented country (design D11).

/** A supported country with its regional defaults, already normalized. */
export interface Country {
  /** ISO 3166-1 alpha-2, uppercase, no `char(n)` padding. */
  code: string
  /** ISO 4217 of the country's local currency. */
  localCurrency: string
  currencyDecimals: number
  currencySymbol: string
  suggestedLanguage: string
  thousandsSeparator: string
  decimalSeparator: string
  firstDayOfWeek: number
  dateFormat: string
  timeFormat: string
  order: number
}

export interface CountryIndexEntry {
  country: Country
  /** Precomputed search terms: lowercased and deaccented. */
  terms: string[]
}

export interface CountryIndex {
  countries: Country[]
  entries: CountryIndexEntry[]
  byCode: Record<string, Country>
}

export interface RegionalDefaults {
  decimales: number
  separadorMiles: string
  separadorDecimal: string
  primerDiaSemana: number
  formatoFecha: string
  formatoHora: string
}

/**
 * Postgres returns every numeric column as a string through PostgREST (project
 * rule 7), and `smallint` arrives as `"0"` / `"42"`. `Number()` covers both the
 * string and the already-numeric case; a non-finite result falls back instead
 * of leaking `NaN` into the UI.
 */
function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toTrimmedText(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * Maps one raw row from `fn_obtener_paises()` to a `Country`.
 *
 * Only the `char(n)` columns are trimmed. `separador_miles` is `text` and a
 * legitimate value is a plain space (`1 000`): trimming it would destroy the
 * separator, so text fields are copied verbatim.
 */
export function normalizeCountryRow(row: any): Country {
  const source = row ?? {}
  return {
    code: toTrimmedText(source.codigo).toUpperCase(),
    localCurrency: toTrimmedText(source.moneda_local).toUpperCase(),
    currencyDecimals: toNumber(source.moneda_decimales, 2),
    currencySymbol: String(source.moneda_simbolo ?? ''),
    suggestedLanguage: toTrimmedText(source.idioma_sugerido).toLowerCase(),
    thousandsSeparator: String(source.separador_miles ?? ''),
    decimalSeparator: String(source.separador_decimal ?? ''),
    firstDayOfWeek: toNumber(source.primer_dia_semana, 1),
    dateFormat: String(source.formato_fecha ?? ''),
    timeFormat: String(source.formato_hora ?? ''),
    order: toNumber(source.orden, Number.MAX_SAFE_INTEGER),
  }
}

/** Strips diacritics so "México" is searchable as "mexico" and "Perú" as "peru". */
export function deaccent(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeTerm(value: string): string {
  return deaccent(value).toLowerCase().trim()
}

/**
 * Country names are data, resolved with `Intl.DisplayNames` so shipping a new
 * language needs no new key in `es.ts` and no country list of our own.
 */
function intlDisplayName(type: 'region' | 'currency', locale: string, code: string): string | null {
  try {
    const display = new Intl.DisplayNames([locale], { type })
    return display.of(code) ?? null
  } catch {
    // Engines built without full ICU have no Intl.DisplayNames.
    return null
  }
}

/** Localized country name for the active UI language; falls back to the ISO code. */
export function regionName(code: string, locale: string): string {
  const normalized = toTrimmedText(code).toUpperCase()
  if (!normalized) return ''
  return intlDisplayName('region', locale, normalized) ?? normalized
}

/** Localized currency name; falls back to the ISO code, never to an invented label. */
export function currencyName(code: string, locale: string): string {
  const normalized = toTrimmedText(code).toUpperCase()
  if (!normalized) return ''
  return intlDisplayName('currency', locale, normalized) ?? normalized
}

const REGIONAL_INDICATOR_BASE = 0x1f1e6

/**
 * Derives the flag from the ISO code with regional indicator symbols, so no
 * emoji literal is stored per country: enabling a country in the catalog is
 * enough. Returns an empty string for anything that is not a 2-letter code.
 */
export function flagEmoji(code: string): string {
  const normalized = toTrimmedText(code).toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return ''
  return String.fromCodePoint(
    ...[...normalized].map((char) => REGIONAL_INDICATOR_BASE + char.charCodeAt(0) - 65)
  )
}

/**
 * Builds the search index once per catalog, not once per keystroke. Each
 * country gets its code plus its Spanish and English names, all lowercased and
 * deaccented, so "Germany" finds Alemania and "PY" finds Paraguay.
 */
export function buildCountryIndex(countries: Country[]): CountryIndex {
  const list = Array.isArray(countries) ? countries : []

  const entries: CountryIndexEntry[] = list.map((country) => {
    const code = toTrimmedText(country.code).toUpperCase()
    const spanish = intlDisplayName('region', 'es', code)
    const english = intlDisplayName('region', 'en', code)

    const terms = new Set<string>()
    // The ISO code always matches and doubles as the fallback name on engines
    // without Intl.DisplayNames.
    for (const candidate of [code, spanish, english]) {
      const term = normalizeTerm(candidate ?? '')
      if (term) terms.add(term)
    }

    return { country, terms: [...terms] }
  })

  const byCode: Record<string, Country> = {}
  for (const country of list) {
    const code = toTrimmedText(country.code).toUpperCase()
    if (code) byCode[code] = country
  }

  return { countries: list, entries, byCode }
}

/**
 * The starter examples of the picker: the first `limit` countries in
 * alphabetical order of their LOCALIZED name.
 *
 * Owner rule (tanda 4): an empty picker must not be a blank box — it opens with
 * five examples, and the moment the user types those five become the closest
 * matches (searchCountries, same limit). Ties fall back to the ISO code so the
 * list is deterministic across engines.
 */
export function exampleCountries(index: CountryIndex, locale: string, limit = 5): Country[] {
  const countries = [...(index?.countries ?? [])]
  if (countries.length === 0) return []

  const collator = new Intl.Collator(locale || undefined, { sensitivity: 'base' })
  countries.sort((a, b) => {
    const nameA = regionName(a.code, locale)
    const nameB = regionName(b.code, locale)
    const byName = collator.compare(nameA, nameB)
    if (byName !== 0) return byName
    return toTrimmedText(a.code).toUpperCase().localeCompare(toTrimmedText(b.code).toUpperCase())
  })

  return countries.slice(0, limit)
}

/**
 * Searches the index. Returns an empty list for an empty query: the picker
 * must never show the full catalog up front. Prefix matches rank before
 * substring matches, and the result is capped at `limit`.
 */
export function searchCountries(index: CountryIndex, query: string, limit = 8): Country[] {
  const normalizedQuery = normalizeTerm(query)
  if (!normalizedQuery) return []

  const prefixMatches: Country[] = []
  const contentMatches: Country[] = []

  for (const entry of index?.entries ?? []) {
    let matchesPrefix = false
    let matchesContent = false
    for (const term of entry.terms) {
      if (term.startsWith(normalizedQuery)) {
        matchesPrefix = true
        break
      }
      if (term.includes(normalizedQuery)) matchesContent = true
    }

    if (matchesPrefix) prefixMatches.push(entry.country)
    else if (matchesContent) contentMatches.push(entry.country)
  }

  const merged: Country[] = []
  const seen = new Set<string>()
  for (const country of [...prefixMatches, ...contentMatches]) {
    const key = toTrimmedText(country.code).toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(country)
  }

  return merged.slice(0, limit)
}

/** Looks up a country by ISO code, case-insensitive and whitespace-tolerant. */
export function findCountry(index: CountryIndex, code: string): Country | null {
  const key = toTrimmedText(code).toUpperCase()
  if (!key) return null
  return index?.byCode?.[key] ?? null
}

/**
 * The regional defaults the onboarding persists for the chosen country
 * (decimal places, separators, first weekday, date and time format).
 */
export function regionalDefaults(country: Country): RegionalDefaults {
  return {
    decimales: country.currencyDecimals,
    separadorMiles: country.thousandsSeparator,
    separadorDecimal: country.decimalSeparator,
    primerDiaSemana: country.firstDayOfWeek,
    formatoFecha: country.dateFormat,
    formatoHora: country.timeFormat,
  }
}
