// lib/currencySymbol.ts
// ============================================
// Currency symbol resolution — pure logic, ZERO imports.
//
// The Node test runner imports this module directly with its type stripping
// (`import { ... } from '../../src/lib/currencySymbol.ts'`). It cannot resolve
// Vite aliases (`@/...`) nor `.js`-to-`.ts` rewrites, so this file must stay
// free of every import. Keep React, the DOM and Supabase out of here.
//
// Why this module exists: the app used to hardcode `$` / `U$S`. A single
// literal cannot tell ARS from USD, and the symbol a user expects comes from
// the currency's regional configuration. Intl is the only source that knows
// `es-AR` renders ARS as `$` while `es-ES` renders EUR as `€`; when Intl has
// no data (engines built without full ICU) we fall back to the catalog symbol
// and finally to the ISO code, never to an invented literal.

export type CurrencySymbolPosition = 'before' | 'after'

/** Trims and uppercases an ISO 4217 code; returns '' for anything unusable. */
function normalizeCurrency(code: unknown): string {
  return String(code ?? '').trim().toUpperCase()
}

/**
 * Resolves the display symbol for a currency in a specific locale.
 *
 * The locale must be specific: `es` alone renders ARS as the code `ARS`,
 * while `es-AR` renders it as `$` (see `buildLocale`).
 *
 * Fallback order: Intl → `fallbackSymbol` (the catalog's `p_monedas.simbolo`)
 * → the ISO code itself. Everything runs inside try/catch because an engine
 * without full ICU throws on currency data it does not have.
 */
export function resolveCurrencySymbol(
  code: string,
  locale: string,
  fallbackSymbol?: string | null
): string {
  const normalizedCode = normalizeCurrency(code)
  const fallback =
    typeof fallbackSymbol === 'string' && fallbackSymbol.trim() ? fallbackSymbol.trim() : null

  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizedCode,
      currencyDisplay: 'symbol',
    }).formatToParts(0)

    const currencyPart = parts.find((part) => part.type === 'currency')
    const symbol = currencyPart?.value?.trim()
    if (symbol) return symbol
  } catch {
    // RangeError on an unknown currency or an unsupported locale. The catalog
    // fallback (or the raw code) is the safe answer.
  }

  return fallback ?? normalizedCode
}

/**
 * Whether the symbol sits before or after the number for this currency in this
 * locale. Read from `formatToParts` by comparing the currency position against
 * the integer position, so `es-AR`+ARS yields `$ 1.234` and `es-ES`+EUR yields
 * `1.234 €`. Defaults to `'before'` when Intl cannot answer.
 */
export function currencySymbolPosition(code: string, locale: string): CurrencySymbolPosition {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizeCurrency(code),
      currencyDisplay: 'symbol',
    }).formatToParts(0)

    const currencyIndex = parts.findIndex((part) => part.type === 'currency')
    const integerIndex = parts.findIndex((part) => part.type === 'integer')
    if (currencyIndex === -1 || integerIndex === -1) return 'before'
    return currencyIndex < integerIndex ? 'before' : 'after'
  } catch {
    return 'before'
  }
}

/**
 * Builds the specific BCP-47 tag Intl needs (`es` + `AR` -> `es-AR`).
 * A bare language is not enough: `es` renders ARS as `ARS`, not `$`.
 *
 * Both subtags are shape-validated. A malformed language falls back to `es`;
 * a malformed or missing region falls back to the bare language. Invalid input
 * is dropped instead of being handed to Intl, which would throw.
 */
export function buildLocale(lang: string, countryCode: string | null | undefined): string {
  const rawLanguage = String(lang ?? '').trim().toLowerCase()
  const language = /^[a-z]{2,3}$/.test(rawLanguage) ? rawLanguage : 'es'

  const region = String(countryCode ?? '').trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(region)) return `${language}-${region}`

  return language
}
