import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { parseError } from '@/locales/i18n'
import {
  buildCountryIndex,
  normalizeCountryRow,
  type Country,
  type CountryIndex,
} from '@/lib/countryCatalog'

/**
 * Versioned cache key: the payload shape can change when the RPC does, so the
 * client must be able to drop a stale list instead of reading it back as if it
 * were current.
 */
export const COUNTRY_CACHE_KEY = 'ord_countries_v1'

/**
 * Reads the cached raw rows. Rows are cached in their PostgREST shape on
 * purpose, so `normalizeCountryRow` stays the single normalizer and a cache
 * round-trip does not silently drop padding or numeric coercion rules.
 */
function readCache(): Country[] | null {
  try {
    const raw = window.localStorage.getItem(COUNTRY_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((row) => row && typeof row === 'object').map(normalizeCountryRow)
  } catch {
    // Storage can be blocked (private mode) or hold corrupt JSON. Neither is
    // an error: the RPC below is still the source of truth.
    return null
  }
}

function writeCache(rows: unknown[]): void {
  try {
    window.localStorage.setItem(COUNTRY_CACHE_KEY, JSON.stringify(rows))
  } catch {
    // Persistence is best effort; a full or blocked storage must not break the
    // picker.
  }
}

export interface CountryCatalogState {
  countries: Country[]
  index: CountryIndex
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Loads the country catalog from `fn_obtener_paises()`, normalizes it and
 * indexes it. The localStorage copy paints the step immediately; the RPC runs
 * in the background to refresh it. A failed RPC only surfaces an error when
 * there is no cached list to fall back to.
 */
export function useCountryCatalog(): CountryCatalogState {
  const [countries, setCountries] = useState<Country[]>(() => readCache() ?? [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Mirrors the current catalog so the failure branch knows whether anything
  // is already on screen, without depending on a stale closure.
  const hasDataRef = useRef(countries.length > 0)
  useEffect(() => {
    hasDataRef.current = countries.length > 0
  }, [countries])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const data = await rpc<unknown>('fn_obtener_paises')
        if (cancelled) return
        const rows = Array.isArray(data) ? data : []
        const normalized = rows.map(normalizeCountryRow)
        setCountries(normalized)
        writeCache(rows)
        setError(null)
      } catch (err) {
        if (cancelled) return
        // Keep the cached list when there is one; only block the step when the
        // RPC failed and nothing can be shown at all.
        if (!hasDataRef.current) setError(parseError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const index = useMemo(() => buildCountryIndex(countries), [countries])

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  return { countries, index, loading, error, reload }
}
