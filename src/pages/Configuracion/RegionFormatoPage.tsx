import { useCallback, useEffect, useState } from 'react'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { isSupported, SUPPORTED } from '@/locales/language'
import { useLanguage } from '@/locales/LanguageProvider'
import { useOptionalAuth } from '@/contexts/AuthContext'
import { clearPrefsSnapshot, writePrefsSnapshot, writeRegionSnapshot } from '@/lib/regionSnapshot'
import { currencyName, flagEmoji, regionName } from '@/lib/countryCatalog'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'

interface RegionPrefs {
  pais_codigo: string
  moneda_default: string
  idioma_default: string
}

interface UserPrefs {
  decimales_moneda_local: number
  decimales_segunda_moneda: number
  separador_miles: string
  separador_decimal: string
  primer_dia_semana: number
  formato_fecha: string
  formato_hora: string
}

// Region row absent happens for legacy accounts without regional config: the
// country selector starts empty and picking one stamps the country with
// origen 'manual'. Never preset 'AR' here: that wrote a country that no one
// confirmed (it lied to any consumer reading the row).
const DEFAULT_PREFS: UserPrefs = {
  decimales_moneda_local: 0,
  decimales_segunda_moneda: 1,
  separador_miles: '.',
  separador_decimal: ',',
  primer_dia_semana: 1,
  formato_fecha: 'DD/MM/YYYY',
  formato_hora: '24h',
}

const WEEKDAY_OPTIONS = [
  { value: 1, labelKey: 'config_first_weekday_monday' },
  { value: 0, labelKey: 'config_first_weekday_sunday' },
  { value: 6, labelKey: 'config_first_weekday_saturday' },
]

const TIME_FORMAT_OPTIONS = [
  { value: '24h', labelKey: 'config_time_format_24' },
  { value: '12h', labelKey: 'config_time_format_12' },
]

/**
 * Language names come from Intl, the same way country names do, so shipping a
 * new language needs no new key in es.ts.
 */
function languageLabel(lang: string): string {
  try {
    const display = new Intl.DisplayNames([lang], { type: 'language' })
    return display.of(lang) ?? t('config_language_spanish')
  } catch {
    // Engines built without full ICU have no Intl.DisplayNames.
    return t('config_language_spanish')
  }
}

export function RegionFormatoPage() {
  const { showToast } = useToast()
  const { lang, setLang } = useLanguage()
  const userId = useOptionalAuth()?.session?.user?.id ?? null
  // The country is data, not code — but it is NOT editable here once the user is
  // logged in: it is the anchor of the regional derivation and of the frozen
  // currency math (decision del dueno). It reads from the confirmed region row;
  // only the language and the minor regional prefs change on this screen.
  const [region, setRegion] = useState<RegionPrefs | null>(null)
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)

  const loadConfig = useCallback(async (cancelledRef: { cancelled: boolean }) => {
    setLoading(true)
    try {
      const [regionData, prefsData] = await Promise.all([
        rpc<RegionPrefs[]>('fn_obtener_region_usuario').catch(() => [] as RegionPrefs[]),
        rpc<UserPrefs[]>('fn_obtener_preferencias_usuario').catch(() => [] as UserPrefs[]),
      ])
      if (cancelledRef.cancelled) return
      const regionRow = Array.isArray(regionData) ? regionData[0] : null
      const prefsRow = Array.isArray(prefsData) ? prefsData[0] : null
      setRegion(regionRow ? { ...regionRow } : null)
      setPrefs({ ...DEFAULT_PREFS, ...(prefsRow ?? {}) })
    } finally {
      if (!cancelledRef.cancelled) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const cancelledRef = { cancelled: false }
    void loadConfig(cancelledRef)
    return () => { cancelledRef.cancelled = true }
  }, [loadConfig])

  // The country cannot be changed from this screen (decision del dueno): no
  // confirm path here. It is set in onboarding; changing it is a support case.

  const savePrefs = async (newPrefs: UserPrefs) => {
    if (newPrefs.separador_miles === newPrefs.separador_decimal) {
      showToast(t('error_separators_must_differ'), 'error')
      return
    }
    try {
      await rpc('fn_actualizar_preferencia_usuario', {
        p_decimales_moneda_local: newPrefs.decimales_moneda_local,
        p_decimales_segunda_moneda: newPrefs.decimales_segunda_moneda,
        p_separador_miles: newPrefs.separador_miles,
        p_separador_decimal: newPrefs.separador_decimal,
        p_primer_dia_semana: newPrefs.primer_dia_semana,
        p_formato_fecha: newPrefs.formato_fecha,
        p_formato_hora: newPrefs.formato_hora,
      })
      writePrefsSnapshot(userId, {
        decimales_moneda_local: newPrefs.decimales_moneda_local,
        decimales_segunda_moneda: newPrefs.decimales_segunda_moneda,
        separador_miles: newPrefs.separador_miles,
        separador_decimal: newPrefs.separador_decimal,
      })
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

  // Language-only changes must not stamp the country as confirmed (assertion 18):
  // no p_origen is sent. Without a confirmed country there is no row to update,
  // so the language persists through the provider's storage and nothing is sent.
  const updateLanguage = (next: string) => {
    if (!isSupported(next)) return
    setLang(next)
    if (region?.pais_codigo) {
      setRegion({ ...region, idioma_default: next })
      rpc('fn_configurar_region_usuario', {
        p_pais_codigo: region.pais_codigo,
        p_moneda_local: '',
        p_idioma: next,
      })
        .then(() => {
          writeRegionSnapshot(userId, {
            countryCode: region.pais_codigo,
            localCurrency: region.moneda_default,
            language: next,
          })
        })
        .catch((err) => showToast(parseError(err), 'error'))
    }
  }

  const updatePref = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    const nextPrefs = { ...prefs, [key]: value }
    setPrefs(nextPrefs)
    void savePrefs(nextPrefs)
  }

  const preview = `125${prefs.separador_miles}000${prefs.separador_decimal}${'0'.repeat(prefs.decimales_moneda_local)}`

  return (
    <main className="page config-page" aria-labelledby="region-config-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="region-config-title">{t('config_section_region')}</h1>
        <p>{loading ? t('config_loading') : t('config_region_desc')}</p>
      </header>

      <section className="config-section-list" aria-label={t('config_section_region')}>

        {/* País e Idioma */}
        <article className="config-section-card">
          <h2>{t('config_country')}</h2>
          <div className="config-section-row">
            <span>{t('config_country')}</span>
            <span>
              {region?.pais_codigo
                ? `${flagEmoji(region.pais_codigo)} ${regionName(region.pais_codigo, lang)}`
                : '—'}
              {" · "}<span style={{ color: 'var(--text-3)' }}>{t('config_country_locked')}</span>
            </span>
          </div>
          <div className="config-section-field">
            <label htmlFor="idioma-default">{t('config_language')}</label>
            <select
              id="idioma-default"
              value={lang}
              onChange={(e) => updateLanguage(e.target.value)}
            >
              {SUPPORTED.map((code) => (
                <option key={code} value={code}>{languageLabel(code)}</option>
              ))}
            </select>
          </div>
        </article>

        {/* Moneda */}
        <article className="config-section-card">
          <h2>{t('config_currency')}</h2>
          <div className="config-section-row">
            <span>{t('config_currency_main')}</span>
            <span>
              {region?.pais_codigo ? `${flagEmoji(region.pais_codigo)} ` : ''}
              {region?.moneda_default || '—'}
              {region?.pais_codigo ? ` · ${currencyName(region.moneda_default, lang)}` : ''}
            </span>
          </div>
          <div className="config-section-row">
            <span>{t('config_currency_secondary')}</span>
            <span>USD — {t('config_currency_locked')}</span>
          </div>
        </article>

        {/* Formato de números */}
        <article className="config-section-card">
          <h2>{t('config_format_numbers')}</h2>
          <div className="config-section-field">
            <label htmlFor="decimales-local">{t('config_decimals_local')}</label>
            <select id="decimales-local" value={prefs.decimales_moneda_local} onChange={(e) => updatePref('decimales_moneda_local', Number(e.target.value))}>
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
          <div className="config-section-field">
            <label htmlFor="decimales-usd">{t('config_decimals_usd')}</label>
            <select id="decimales-usd" value={prefs.decimales_segunda_moneda} onChange={(e) => updatePref('decimales_segunda_moneda', Number(e.target.value))}>
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
          <div className="config-section-field">
            <label htmlFor="separador-miles">{t('config_thousands_separator')}</label>
            <select id="separador-miles" value={prefs.separador_miles} onChange={(e) => updatePref('separador_miles', e.target.value)}>
              <option value=".">.</option>
              <option value=",">,</option>
              <option value=" ">{t('config_separator_space')}</option>
            </select>
          </div>
          <div className="config-section-field">
            <label htmlFor="separador-decimal">{t('config_decimal_separator')}</label>
            <select id="separador-decimal" value={prefs.separador_decimal} onChange={(e) => updatePref('separador_decimal', e.target.value)}>
              <option value=",">,</option>
              <option value=".">.</option>
            </select>
          </div>
          <div className="config-section-row">
            <span>{t('config_preview')}</span>
            <span>{region?.moneda_default || ''} {preview}</span>
          </div>
        </article>

        {/* Primer día de la semana */}
        <article className="config-section-card">
          <h2>{t('config_first_weekday_label')}</h2>
          <div className="config-section-field">
            <label htmlFor="primer-dia-semana">{t('config_first_weekday_label')}</label>
            <select
              id="primer-dia-semana"
              value={prefs.primer_dia_semana}
              onChange={(e) => updatePref('primer_dia_semana', Number(e.target.value))}
            >
              {WEEKDAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>
        </article>

        {/* Formato de hora (24h por defecto; 12h para culturas AM/PM) */}
        <article className="config-section-card">
          <h2>{t('config_time_format_title')}</h2>
          <div className="config-section-field">
            <label htmlFor="formato-hora">{t('config_time_format_title')}</label>
            <select
              id="formato-hora"
              value={prefs.formato_hora || '24h'}
              onChange={(e) => updatePref('formato_hora', e.target.value)}
            >
              {TIME_FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>
        </article>

      </section>
    </main>
  )
}

export default RegionFormatoPage