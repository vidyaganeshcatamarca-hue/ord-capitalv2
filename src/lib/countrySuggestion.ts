// lib/countrySuggestion.ts
// ============================================
// Decides which country to pre-select in the onboarding step.
//
// Pure logic, ZERO imports: the tests import this file directly with Node.
//
// Priority, decided by the product owner:
//   - On the native app the device locale IS the device: it wins over the IP.
//   - On the web there is no device separate from the browser, and a browser in
//     "Spanish (Spain)" is common even outside Spain (a real user in Argentina
//     reported exactly that), so the IP wins and the locale is only the fallback.
//   - If neither signal exists, there is no suggestion and the step starts empty.
//
// This is only a suggestion: the country step always requires an explicit
// confirmation before anything is persisted.

export type CountrySuggestionSource = 'ip' | 'locale' | 'none'

export interface CountrySuggestion {
  country: string | null
  source: CountrySuggestionSource
}

/** Two uppercase letters or null; tolerates `char(2)` padding and mixed case. */
export function normalizeCountryCode(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null
}

export function resolveCountrySuggestion(input: {
  isNative: boolean
  ipCountry?: string | null
  deviceRegion?: string | null
}): CountrySuggestion {
  const fromIp = normalizeCountryCode(input?.ipCountry)
  const fromLocale = normalizeCountryCode(input?.deviceRegion)

  // The order is the whole point of this module, so it is written once and plainly.
  const ordered: Array<[CountrySuggestionSource, string | null]> = input?.isNative
    ? [
        ['locale', fromLocale],
        ['ip', fromIp],
      ]
    : [
        ['ip', fromIp],
        ['locale', fromLocale],
      ]

  for (const [source, country] of ordered) {
    if (country) return { country, source }
  }

  return { country: null, source: 'none' }
}
