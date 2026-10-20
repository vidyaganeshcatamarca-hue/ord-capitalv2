// hooks/useActiveLocale.ts
// The BCP-47 locale the user is currently reading in.
//
// The app already resolves it: `useNumberFormat` builds it from the active
// language and the user's country (`buildLocale(lang, countryCode)`), and
// publishes it to `lib/format.ts` for the ~22 modules that cannot use a hook.
//
// This hook exists for the same reason in the opposite direction: a
// component that needs the locale INSIDE a callback or a module-level
// formatter needs it as a value, not as a context field it must thread by
// hand.
//
// Before the second language shipped, 28 call sites in 15 files formatted
// with a literal `'es-AR'`, so an English reader saw English text next to
// `$1.235` and `10 oct 2026`. Those call sites use this hook (or the shared
// `lib/format.ts` helpers) now.
//
// A module-level formatter is a trap here: it is evaluated once when the
// module is imported, and the language change remounts the tree without
// re-evaluating it. Anything that formats money must either read the locale
// at call time (this hook, or a function that reads the shared context) or
// be re-created when the locale changes.

import { useMemo } from 'react'
import { useLanguage } from '@/locales/LanguageProvider'
import { buildLocale } from '@/lib/currencySymbol'

/**
 * The locale to hand to `Intl` for the active language and country.
 *
 * Falls back to the bare language (`'es'`, `'en'`) when the country is
 * unknown, and to `'es-AR'` when the language itself is unusable — the
 * historical default of the app.
 */
export function useActiveLocale(countryCode?: string | null): string {
  const { lang } = useLanguage()
  return useMemo(() => buildLocale(lang, countryCode ?? null), [lang, countryCode])
}

/**
 * The active language, normalized to a BCP-47 tag suitable for `Intl` and
 * for the voice backend. `'en'` + `'US'` gives `'en-US'`.
 */
export function useActiveLanguageTag(countryCode?: string | null): string {
  return useActiveLocale(countryCode)
}
