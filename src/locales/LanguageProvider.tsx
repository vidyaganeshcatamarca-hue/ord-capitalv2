import { createContext, useCallback, useContext, Fragment, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { getLanguage, setLanguage, subscribe } from '@/locales/i18n'
import {
  DEFAULT_LANG,
  isSupported,
  parseDeviceLocales,
  resolveLanguage,
  type Lang,
  type LanguageSource,
} from '@/locales/language'

/**
 * Language preference, readable before the first login. The copy in
 * `p_config_region.idioma_default` is WU3's job, because only there the
 * region row is already loaded.
 */
export const LANGUAGE_STORAGE_KEY = 'ord_lang'

export interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  /** Where the active language came from; lets WU3 know if the user already chose. */
  source: LanguageSource
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  } catch {
    // Storage can be blocked (private mode, hardened browser). A missing
    // preference is not an error: it just falls through the precedence chain.
    return null
  }
}

function readDeviceLocales(): string[] {
  if (typeof navigator === 'undefined') return []
  return parseDeviceLocales(navigator.languages ?? navigator.language)
}

/**
 * Resolves the language and pushes it into the translator before the first
 * render, so no component paints a frame in the wrong language. No country is
 * passed yet: the country suggestion needs the catalog from WU3.
 */
function resolveInitialLanguage(): { lang: Lang; source: LanguageSource } {
  const resolved = resolveLanguage({
    stored: readStoredLanguage(),
    deviceLocales: readDeviceLocales(),
  })
  setLanguage(resolved.lang)
  return resolved
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [{ source: initialSource }] = useState(resolveInitialLanguage)
  const [source, setSource] = useState<LanguageSource>(initialSource)

  // Components call t() directly and subscribe to nothing, so the translator
  // has to be turned into a render dependency here.
  const snapshot = useSyncExternalStore(subscribe, getLanguage, getLanguage)
  const lang: Lang = isSupported(snapshot) ? snapshot : DEFAULT_LANG

  const setLang = useCallback((next: Lang) => {
    setLanguage(next)
    setSource('stored')
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    } catch {
      // Same as readStoredLanguage: persistence is best effort.
    }
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang, source }),
    [lang, setLang, source]
  )

  return (
    <LanguageContext.Provider value={value}>
      {/* A re-render alone is not enough: memoized strings, module-level caches
       * and Intl formatters survive it. Remounting the subtree is the
       * brute-force invalidation that rebuilds every translated string. */}
      <Fragment key={lang}>{children}</Fragment>
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
