import { useEffect, useMemo, useRef, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { parseDeviceLocales, resolveRegionFromLocale } from '@/locales/language'
import { useLanguage } from '@/locales/LanguageProvider'
import { useOptionalAuth } from '@/contexts/AuthContext'
import { useCountryCatalog } from '@/lib/useCountryCatalog'
import { writeRegionSnapshot } from '@/lib/regionSnapshot'
import {
  currencyName,
  findCountry,
  flagEmoji,
  regionName,
  type Country,
} from '@/lib/countryCatalog'
import { CountrySearchModal } from './CountrySearchModal'

interface CountryStepProps {
  /** Fired after the region is persisted. The parent advances the slide. */
  onConfirmed: (country: Country) => void
}

type CountryOrigin = 'locale' | 'manual'

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
export function CountryStep({ onConfirmed }: CountryStepProps) {
  const { lang } = useLanguage()
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
  const [unsupported, setUnsupported] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const didPreselect = useRef(false)

  useEffect(() => {
    if (didPreselect.current) return

    if (!deviceRegion) {
      // No locale signal: nothing to pre-select, the user must choose.
      didPreselect.current = true
      return
    }
    // Wait for the catalog. If the RPC is still loading or failed, retrying it
    // should still be able to pre-select, so do not mark the attempt as done.
    if (countries.length === 0) return

    didPreselect.current = true
    const match = findCountry(index, deviceRegion)
    if (match) {
      setSelected(match)
      setOrigin('locale')
    } else {
      // Detected region is not in the supported catalog (design D19).
      setUnsupported(true)
    }
  }, [countries.length, index, deviceRegion])

  const handleSelect = (country: Country) => {
    setSelected(country)
    setOrigin('manual')
    setUnsupported(false)
    setSubmitError(null)
    setShowSearch(false)
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
            <button
              type="button"
              className="onboarding-link-btn"
              onClick={() => setShowSearch(true)}
            >
              {t('onboarding_country_change')}
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
