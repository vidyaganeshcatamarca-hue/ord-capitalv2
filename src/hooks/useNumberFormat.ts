import { useCallback, useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useLanguage } from '@/locales/LanguageProvider'
import { useOptionalAuth } from '@/contexts/AuthContext'
import { buildLocale, currencySymbolPosition, resolveCurrencySymbol } from '@/lib/currencySymbol'
import {
  readPrefsSnapshot,
  readRegionSnapshot,
  writePrefsSnapshot,
  writeRegionSnapshot,
} from '@/lib/regionSnapshot'
import { setFormatContext } from '@/lib/format'

interface UserFormatPrefs {
  decimales_moneda_local: number
  decimales_segunda_moneda: number
  separador_miles: string
  separador_decimal: string
}

/** Region resolved from `fn_obtener_region_usuario()`. */
export interface UserRegion {
  countryCode: string
  localCurrency: string
  language: string
}

/** Raw PostgREST row shape returned by `fn_obtener_region_usuario()`. */
interface UserRegionRow {
  pais_codigo?: string | null
  moneda_default?: string | null
  idioma_default?: string | null
}

const DEFAULTS: UserFormatPrefs = {
  decimales_moneda_local: 0,
  decimales_segunda_moneda: 1,
  separador_miles: '.',
  separador_decimal: ',',
}

/**
 * The hook mounts on many screens at once and every instance needs the same
 * region, so the in-flight promise is memoized at module scope: N mounts share
 * one RPC instead of firing N identical requests.
 *
 * A failure is intentionally NOT cached. The `.catch` clears the promise so a
 * later mount (or `reloadRegion`) can retry instead of inheriting a broken
 * state for the rest of the session.
 */
let regionPromise: Promise<UserRegion | null> | null = null

/** Drops the memoized region request so the next call hits the RPC again. */
export function invalidateRegionCache(): void {
  regionPromise = null
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function fetchUserRegion(): Promise<UserRegion | null> {
  if (!regionPromise) {
    regionPromise = rpc<UserRegionRow[]>('fn_obtener_region_usuario')
      .then((data) => {
        const row = Array.isArray(data) ? data[0] : data
        if (!row) return null
        const localCurrency = toText(row.moneda_default).toUpperCase()
        if (!localCurrency) return null
        return {
          countryCode: toText(row.pais_codigo).toUpperCase(),
          localCurrency,
          language: toText(row.idioma_default).toLowerCase(),
        }
      })
      .catch(() => {
        regionPromise = null
        return null
      })
  }
  return regionPromise
}

export function useNumberFormat() {
  const { lang } = useLanguage()
  const userId = useOptionalAuth()?.session?.user?.id ?? null
  const [prefs, setPrefs] = useState<UserFormatPrefs>(DEFAULTS)
  const [region, setRegion] = useState<UserRegion | null>(null)
  const [regionLoading, setRegionLoading] = useState(true)
  const [regionError, setRegionError] = useState(false)
  const [regionAttempt, setRegionAttempt] = useState(0)
  const [hydratedFor, setHydratedFor] = useState<string | null>(null)

  // First paint from the local snapshot. These values change rarely, so beating
  // the RPC by one round trip is the difference between rendering '-' and
  // rendering the amount. It runs as soon as the user id is known, and again if
  // the user changes (the snapshot is per user and must not leak between them).
  useEffect(() => {
    if (!userId || hydratedFor === userId) return
    const cachedRegion = readRegionSnapshot(userId)
    const cachedPrefs = readPrefsSnapshot(userId)
    if (cachedRegion) {
      setRegion(cachedRegion)
      setRegionLoading(false)
    }
    if (cachedPrefs) setPrefs(cachedPrefs)
    setHydratedFor(userId)
  }, [userId, hydratedFor])

  useEffect(() => {
    let cancelled = false
    setRegionLoading(true)
    setRegionError(false)
    fetchUserRegion().then((resolved) => {
      if (cancelled) return
      setRegion(resolved)
      setRegionError(resolved === null)
      setRegionLoading(false)
      // Refresh the snapshot so the next first paint does not wait either.
      writeRegionSnapshot(userId, resolved)
    })
    return () => {
      cancelled = true
    }
  }, [regionAttempt, userId])

  useEffect(() => {
    let cancelled = false
    rpc<UserFormatPrefs[]>('fn_obtener_preferencias_usuario')
      .then((data) => {
        if (cancelled) return
        const row = Array.isArray(data) ? data[0] : data
        if (!row) return
        // Decimals and separators are derived by the server when the country
        // is confirmed; the client only reads and clamps them.
        const next: UserFormatPrefs = {
          decimales_moneda_local: clampInt(row.decimales_moneda_local, 0, 4, 0),
          decimales_segunda_moneda: clampInt(row.decimales_segunda_moneda, 0, 4, 1),
          separador_miles:
            typeof row.separador_miles === 'string' && row.separador_miles
              ? row.separador_miles
              : DEFAULTS.separador_miles,
          separador_decimal:
            typeof row.separador_decimal === 'string' && row.separador_decimal
              ? row.separador_decimal
              : DEFAULTS.separador_decimal,
        }
        setPrefs(next)
        writePrefsSnapshot(userId, next)
      })
      .catch(() => {
        // Keep defaults if the RPC fails.
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const locale = buildLocale(lang, region?.countryCode ?? null)

  // `lib/format.ts` is called from ~22 files that cannot use a hook, so the resolved
  // context is published for them. Without this, those screens kept formatting with
  // Argentine rules (locale es-AR, 0 decimals, ARS by default).
  useEffect(() => {
    setFormatContext({
      locale,
      localCurrency: region?.localCurrency || 'ARS',
      decimalsLocal: prefs.decimales_moneda_local,
      decimalsSecondary: prefs.decimales_segunda_moneda,
      // El separador elegido viaja al contexto para que `formatPercent` lo use:
      // los porcentajes del modulo de Inversiones lo estaban ignorando.
      decimalSeparator: prefs.separador_decimal,
    })
  }, [locale, region, prefs])

  const reloadRegion = useCallback(() => {
    invalidateRegionCache()
    setRegionAttempt((attempt) => attempt + 1)
  }, [])

  const formatMonto = useCallback(
    (monto: number | string, moneda?: string, decimales?: number): string => {
      const n = typeof monto === 'string' ? parseFloat(monto) : Number(monto)
      if (Number.isNaN(n)) return '-'

      // No explicit currency means the user's local currency, never a literal.
      const currency = toText(moneda || region?.localCurrency).toUpperCase()
      if (!currency) return '-'

      // Digit override for compact summaries (donut totals and category rows read
      // better rounded); null/undefined keeps the regional preference.
      const digits =
        decimales ??
        (currency === 'USD' ? prefs.decimales_segunda_moneda : prefs.decimales_moneda_local)
      const fixed = n.toFixed(digits)
      const [intPart, decPart] = fixed.split('.')
      const intWithThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, prefs.separador_miles)

      const symbol = resolveCurrencySymbol(currency, locale, null)
      const position = currencySymbolPosition(currency, locale)
      const numberText =
        decPart !== undefined && digits > 0
          ? `${intWithThousands}${prefs.separador_decimal}${decPart}`
          : intWithThousands

      if (!symbol) return numberText
      return position === 'after' ? `${numberText} ${symbol}` : `${symbol} ${numberText}`
    },
    [prefs, region, locale]
  )

  /**
   * Symbol for a currency, resolved from the user's locale. Screens that render an
   * input prefix must use this instead of writing '$' or 'U$S' by hand: with the
   * symbol duplicated in a dozen files, a euro wallet showed a dollar sign.
   */
  const currencySymbol = useCallback(
    (code?: string): string => {
      const currency = toText(code || region?.localCurrency).toUpperCase()
      return currency ? resolveCurrencySymbol(currency, locale, null) : ''
    },
    [region, locale]
  )

  return {
    formatMonto,
    currencySymbol,
    prefs,
    localCurrency: region?.localCurrency ?? null,
    countryCode: region?.countryCode ?? null,
    locale,
    regionLoading,
    regionError,
    reloadRegion,
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const i = Math.trunc(n)
  if (i < min) return min
  if (i > max) return max
  return i
}
