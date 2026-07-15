import { useEffect, useState } from 'react'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { useToast } from '@/contexts/ToastContext'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
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
}

const DEFAULT_REGION: RegionPrefs = {
  pais_codigo: 'AR',
  moneda_default: 'ARS',
  idioma_default: 'es',
}

const DEFAULT_PREFS: UserPrefs = {
  decimales_moneda_local: 0,
  decimales_segunda_moneda: 1,
  separador_miles: '.',
  separador_decimal: ',',
  primer_dia_semana: 1,
  formato_fecha: 'DD/MM/YYYY',
}

// 20 países: Américas + Europa
const COUNTRY_OPTIONS = [
  // Américas
  { code: 'AR', labelKey: 'config_country_argentina',  currency: 'ARS' },
  { code: 'UY', labelKey: 'config_country_uruguay',    currency: 'UYU' },
  { code: 'CL', labelKey: 'config_country_chile',      currency: 'CLP' },
  { code: 'CO', labelKey: 'config_country_colombia',   currency: 'COP' },
  { code: 'MX', labelKey: 'config_country_mexico',     currency: 'MXN' },
  { code: 'PE', labelKey: 'config_country_peru',       currency: 'PEN' },
  { code: 'BR', labelKey: 'config_country_brazil',     currency: 'BRL' },
  { code: 'EC', labelKey: 'config_country_ecuador',    currency: 'USD' },
  { code: 'PY', labelKey: 'config_country_paraguay',   currency: 'PYG' },
  { code: 'BO', labelKey: 'config_country_bolivia',    currency: 'BOB' },
  { code: 'VE', labelKey: 'config_country_venezuela',  currency: 'VES' },
  { code: 'PA', labelKey: 'config_country_panama',     currency: 'PAB' },
  { code: 'CR', labelKey: 'config_country_costa_rica', currency: 'CRC' },
  // Europa
  { code: 'ES', labelKey: 'config_country_spain',      currency: 'EUR' },
  { code: 'DE', labelKey: 'config_country_germany',    currency: 'EUR' },
  { code: 'FR', labelKey: 'config_country_france',     currency: 'EUR' },
  { code: 'IT', labelKey: 'config_country_italy',      currency: 'EUR' },
  { code: 'PT', labelKey: 'config_country_portugal',   currency: 'EUR' },
  { code: 'GB', labelKey: 'config_country_uk',         currency: 'GBP' },
  // Norteamérica
  { code: 'US', labelKey: 'config_country_usa',        currency: 'USD' },
]

const WEEKDAY_OPTIONS = [
  { value: 1, labelKey: 'config_first_weekday_monday' },
  { value: 0, labelKey: 'config_first_weekday_sunday' },
  { value: 6, labelKey: 'config_first_weekday_saturday' },
]

function getCurrencyForCountry(code: string) {
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.currency ?? 'ARS'
}

export function RegionFormatoPage() {
  const { showToast } = useToast()
  const [region, setRegion] = useState<RegionPrefs>(DEFAULT_REGION)
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      setLoading(true)
      try {
        const [regionData, prefsData] = await Promise.all([
          rpc<RegionPrefs[]>('fn_obtener_region_usuario').catch(() => [] as RegionPrefs[]),
          rpc<UserPrefs[]>('fn_obtener_preferencias_usuario').catch(() => [] as UserPrefs[]),
        ])
        if (cancelled) return
        const regionRow = Array.isArray(regionData) ? regionData[0] : regionData
        const prefsRow = Array.isArray(prefsData) ? prefsData[0] : prefsData
        if (regionRow) setRegion({ ...DEFAULT_REGION, ...regionRow })
        if (prefsRow) setPrefs({ ...DEFAULT_PREFS, ...prefsRow })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadConfig()
    return () => { cancelled = true }
  }, [])

  const saveRegion = async (newRegion: RegionPrefs) => {
    try {
      await rpc('fn_configurar_region_usuario', {
        p_pais_codigo: newRegion.pais_codigo,
        p_moneda_local: newRegion.moneda_default,
        p_idioma: newRegion.idioma_default,
      })
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

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
      })
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

  const updateCountry = (pais_codigo: string) => {
    const nextRegion = {
      ...region,
      pais_codigo,
      moneda_default: getCurrencyForCountry(pais_codigo),
    }
    setRegion(nextRegion)
    saveRegion(nextRegion)
  }

  const updateRegionField = <K extends keyof RegionPrefs>(key: K, value: RegionPrefs[K]) => {
    const nextRegion = { ...region, [key]: value }
    setRegion(nextRegion)
    saveRegion(nextRegion)
  }

  const updatePref = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    const nextPrefs = { ...prefs, [key]: value }
    setPrefs(nextPrefs)
    savePrefs(nextPrefs)
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
          <div className="config-section-field">
            <label htmlFor="pais-codigo">{t('config_country')}</label>
            <select id="pais-codigo" value={region.pais_codigo} onChange={(e) => updateCountry(e.target.value)}>
              {[...COUNTRY_OPTIONS]
                .sort((a, b) => t(a.labelKey).localeCompare(t(b.labelKey)))
                .map((c) => (
                  <option key={c.code} value={c.code}>{t(c.labelKey)}</option>
              ))}
            </select>
          </div>
          <div className="config-section-field">
            <label htmlFor="idioma-default">{t('config_language')}</label>
            <select
              id="idioma-default"
              value={region.idioma_default}
              onChange={(e) => updateRegionField('idioma_default', e.target.value)}
            >
              <option value="es">{t('config_language_spanish')}</option>
            </select>
          </div>
        </article>

        {/* Moneda */}
        <article className="config-section-card">
          <h2>{t('config_currency')}</h2>
          <div className="config-section-row">
            <span>{t('config_currency_main')}</span>
            <span>{region.moneda_default}</span>
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
            <span>{region.moneda_default} {preview}</span>
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

      </section>
    </main>
  )
}

export default RegionFormatoPage
