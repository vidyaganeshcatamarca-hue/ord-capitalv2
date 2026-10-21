import { useEffect, useMemo, useRef, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { parseDeviceLocales, resolveRegionFromLocale, suggestedLanguageFor } from '@/locales/language'
import { useLanguage } from '@/locales/LanguageProvider'
import { useOptionalAuth } from '@/contexts/AuthContext'
import { Capacitor } from '@capacitor/core'
import { useCountryCatalog } from '@/lib/useCountryCatalog'
import { resolveCountrySuggestion } from '@/lib/countrySuggestion'
import { writeRegionSnapshot } from '@/lib/regionSnapshot'
import {
  currencyName,
  findCountry,
  flagEmoji,
  regionName,
  type Country,
} from '@/lib/countryCatalog'
import { CountrySearchModal } from './CountrySearchModal'
import { LanguageSelect } from '@/components/LanguageSelect/LanguageSelect'

interface CountryStepProps {
  /** Fired after the region is persisted. The parent advances the slide. */
  onConfirmed: (country: Country) => void
  /**
   * The country already picked, as its ISO code.
   *
   * The parent owns it because the provider remounts the whole subtree when
   * the language changes, and the language picker sits right under the
   * country: a country kept in this component's local state would vanish the
   * moment the user changes the language.
   */
  initialCountryCode?: string
  /** Fired whenever the country changes, so the parent can keep it. */
  onCountryPicked?: (code: string) => void
}

type CountryOrigin = 'locale' | 'ip' | 'manual'

/**
 * Country of the connection, asked to Vercel once per page load.
 *
 * Vercel does not attach the geolocation headers locally, so in development there is
 * no IP signal at all and the browser locale would always win — which is exactly how
 * a browser set to "Spanish (Spain)" kept suggesting Spain from Argentina. Setting
 * `VITE_DEV_GEO_COUNTRY=AR` in `.env.local` simulates the header so the priority
 * logic can be exercised without deploying. It is dev-only on purpose.
 *
 * It resolves to `null` (never rejects) when the endpoint is missing, the
 * request fails or it takes too long, because the step must not be blocked
 * waiting for a signal it can live without.
 */
const GEO_TIMEOUT_MS = 2500
let geoPromise: Promise<string | null> | null = null

function fetchGeoCountry(): Promise<string | null> {
  const devOverride = import.meta.env.DEV ? import.meta.env.VITE_DEV_GEO_COUNTRY : undefined
  if (typeof devOverride === 'string' && devOverride.trim()) {
    return Promise.resolve(devOverride.trim().toUpperCase())
  }

  if (!geoPromise) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = setTimeout(() => controller?.abort(), GEO_TIMEOUT_MS)
    geoPromise = fetch('/api/geo', { signal: controller?.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => (body && typeof body.country === 'string' ? body.country : null))
      .catch(() => null)
      .finally(() => clearTimeout(timer))
  }
  return geoPromise
}

/**
 * Mandatory onboarding step: country. It is always shown and always requires an
 * explicit "Continue" (design D3): no country is ever persisted without the
 * user confirming it. When the device locale carries a supported region, that
 * country is pre-selected; otherwise the button stays disabled and the user
 * picks from the search modal.
 *
 * Order matters: this step persists the region BEFORE the wallet step exists,
 * so the initial wallets are created in the right currency.
 */
export function CountryStep({ onConfirmed, initialCountryCode = '', onCountryPicked }: CountryStepProps) {
  const { lang, setLang } = useLanguage()
  const userId = useOptionalAuth()?.session?.user?.id ?? null
  const { countries, index, loading, error, reload } = useCountryCatalog()

  const deviceRegion = useMemo(
    () =>
      resolveRegionFromLocale(
        parseDeviceLocales(
          typeof navigator !== 'undefined' ? navigator.languages ?? navigator.language : []
        )
      ),
    []
  )

  const [selected, setSelected] = useState<Country | null>(null)
  const [origin, setOrigin] = useState<CountryOrigin>('manual')
  // `undefined` while Vercel is still answering, `null` when there is no signal.
  const [ipCountry, setIpCountry] = useState<string | null | undefined>(undefined)
  const [unsupported, setUnsupported] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const didPreselect = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetchGeoCountry().then((country) => {
      if (!cancelled) setIpCountry(country)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (didPreselect.current) return
    // Wait for both signals before deciding: pre-selecting from the locale and
    // reconsidering later would yank a country out from under the user.
    if (ipCountry === undefined) return
    // Wait for the catalog. If the RPC is still loading or failed, retrying it
    // should still be able to pre-select, so do not mark the attempt as done.
    if (countries.length === 0) return

    didPreselect.current = true

    // A country the user already picked wins over any detection: it is an
    // explicit choice, and it is how the country survives the remount the
    // provider does when the language changes.
    if (initialCountryCode) {
      const picked = findCountry(index, initialCountryCode)
      if (picked) {
        setSelected(picked)
        setOrigin('manual')
        return
      }
    }

    const suggestion = resolveCountrySuggestion({
      isNative: Capacitor.isNativePlatform(),
      ipCountry,
      deviceRegion,
    })
    if (!suggestion.country) return

    const match = findCountry(index, suggestion.country)
    if (match) {
      setSelected(match)
      setOrigin(suggestion.source === 'ip' ? 'ip' : 'locale')
      onCountryPicked?.(match.code)
    } else {
      // Detected country is not in the supported catalog (design D19).
      setUnsupported(true)
    }
  }, [countries.length, index, deviceRegion, ipCountry, initialCountryCode])

  const handleSelect = (country: Country) => {
    setSelected(country)
    setOrigin('manual')
    setUnsupported(false)
    setSubmitError(null)
    setShowSearch(false)
    onCountryPicked?.(country.code)
    // The country brings its language with it: picking Brazil lands in
    // Portuguese, picking Argentina in Spanish. A country whose language the
    // app does not ship keeps the current one — the picker below shows every
    // available language, so the user can still choose.
    const suggested = suggestedLanguageFor(country.suggestedLanguage)
    if (suggested) setLang(suggested)
  }

  const handleContinue = async () => {
    if (!selected) return
    setSaving(true)
    setSubmitError(null)
    try {
      await rpc('fn_configurar_region_usuario', {
        p_pais_codigo: selected.code,
        // The server ignores this argument (the country defines the currency),
        // but the signature still requires it.
        p_moneda_local: selected.localCurrency,
        p_idioma: lang,
        p_origen: origin,
      })
      // Cache the region immediately: the wallet slide comes next and must not
      // wait for a refetch to know which currency it is working with.
      writeRegionSnapshot(userId, {
        countryCode: selected.code,
        localCurrency: selected.localCurrency,
        language: lang,
      })
      onConfirmed(selected)
    } catch (err) {
      // A network failure must not trap the user: show the error and let them
      // retry with the same selection.
      setSubmitError(parseError(err))
    } finally {
      setSaving(false)
    }
  }

  const catalogFailed = error !== null && countries.length === 0

  return (
    <>
      <div className="onboarding-slide slide-active">
        <div className="slide-content">
          <h2 className="slide-title">{t('onboarding_country_title')}</h2>
          <p className="slide-subtitle">{t('onboarding_country_subtitle')}</p>

          {catalogFailed ? (
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <p style={{ marginBottom: '12px' }}>{t('onboarding_country_error')}</p>
              <button type="button" className="btn btn-outline btn-full" onClick={reload}>
                {t('onboarding_country_retry')}
              </button>
            </div>
          ) : selected ? (
            <>
              <div
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px' }}
              >
                <span aria-hidden="true" style={{ fontSize: '32px', lineHeight: 1 }}>
                  {flagEmoji(selected.code)}
                </span>
                <div>
                  <div style={{ fontWeight: 700 }}>{regionName(selected.code, lang)}</div>
                  <div style={{ color: 'var(--text-3)' }}>
                    {selected.localCurrency} · {currencyName(selected.localCurrency, lang)}
                  </div>
                </div>
              </div>
              {/* The change-country link sits right under the suggested country, not
              under the CTA: the decision the user faces is about the country, and the
              user report was that buried at the bottom it went unnoticed. */}
              <button
                type="button"
                className="onboarding-link-btn"
                style={{ marginTop: '8px' }}
                onClick={() => setShowSearch(true)}
              >
                {t('onboarding_country_change')}
              </button>
              {/* The language sits right under the country, on the same screen:
              the country decides the currency and the language, and both are
              part of the same decision. The picker always offers every
              language the app ships, so the suggestion is a default and not a
              cage. */}
              <div className="onboarding-language-row">
                <label htmlFor="onboarding-language">{t('onboarding_language_label')}</label>
                <LanguageSelect
                  id="onboarding-language"
                  label={t('onboarding_language_label')}
                  value={lang}
                  onChange={setLang}
                  className="config-section-select"
                />
                <p className="onboarding-language-hint">{t('onboarding_language_hint')}</p>
              </div>
            </>
          ) : loading || unsupported ? (
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-3)' }}>
                {unsupported ? t('onboarding_country_unsupported') : t('config_loading')}
              </p>
            </div>
          ) : null}

          <div className="slide-footer flex flex-col gap-2">
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleContinue}
              disabled={!selected || saving}
            >
              {saving ? t('btn_saving') : t('onboarding_country_cta')}
            </button>
            {submitError && (
              <p style={{ color: 'var(--danger, #e5484d)', fontSize: '14px' }}>{submitError}</p>
            )}
          </div>
        </div>
      </div>

      <CountrySearchModal
        open={showSearch}
        index={index}
        lang={lang}
        onClose={() => setShowSearch(false)}
        onSelect={handleSelect}
      />
    </>
  )
}
