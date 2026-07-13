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

const COUNTRY_OPTIONS = [
  { code: 'AR', labelKey: 'config_country_argentina', currency: 'ARS' },
  { code: 'US', labelKey: 'config_country_usa', currency: 'USD' },
  { code: 'UY', labelKey: 'config_country_uruguay', currency: 'UYU' },
]

function getCurrencyForCountry(code: string) {
  return COUNTRY_OPTIONS.find((country) => country.code === code)?.currency ?? 'ARS'
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

  const updateCountry = (pais_codigo: string) => {
    setRegion((current) => ({
      ...current,
      pais_codigo,
      moneda_default: getCurrencyForCountry(pais_codigo),
    }))
  }

  const save = async () => {
    if (prefs.separador_miles === prefs.separador_decimal) {
      showToast(t('error_separators_must_differ'), 'error')
      return
    }

    setSaving(true)
    try {
      await rpc('fn_configurar_region_usuario', {
        p_pais_codigo: region.pais_codigo,
        p_moneda_local: region.moneda_default,
        p_idioma: region.idioma_default,
      })
      await rpc('fn_actualizar_preferencia_usuario', {
        p_decimales_moneda_local: prefs.decimales_moneda_local,
        p_decimales_segunda_moneda: prefs.decimales_segunda_moneda,
        p_separador_miles: prefs.separador_miles,
        p_separador_decimal: prefs.separador_decimal,
        p_primer_dia_semana: prefs.primer_dia_semana,
        p_formato_fecha: prefs.formato_fecha,
      })
      showToast(t('success_preferences_saved'), 'success')
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setSaving(false)
    }
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
        <article className="config-section-card">
          <h2>{t('config_country')}</h2>
          <div className="config-section-field">
            <label htmlFor="pais-codigo">{t('config_country')}</label>
            <select id="pais-codigo" value={region.pais_codigo} onChange={(event) => updateCountry(event.target.value)}>
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.code} value={country.code}>{t(country.labelKey)}</option>
              ))}
            </select>
          </div>
          <div className="config-section-field">
            <label htmlFor="idioma-default">{t('config_language')}</label>
            <select id="idioma-default" value={region.idioma_default} onChange={(event) => setRegion((current) => ({ ...current, idioma_default: event.target.value }))}>
              <option value="es">{t('config_language_spanish')}</option>
            </select>
          </div>
        </article>

        <article className="config-section-card">
          <h2>{t('config_currency')}</h2>
          <div className="config-section-row">
            <span>{t('config_currency_main')}</span>
            <span>{region.moneda_default}</span>
          </div>
          <div className="config-section-row">
            <span>{t('config_currency_secondary')}</span>
            <span>USD - {t('config_currency_locked')}</span>
          </div>
        </article>

        <article className="config-section-card">
          <h2>{t('config_format_numbers')}</h2>
          <div className="config-section-field">
            <label htmlFor="decimales-local">{t('config_decimals_local')}</label>
            <select id="decimales-local" value={prefs.decimales_moneda_local} onChange={(event) => setPrefs((current) => ({ ...current, decimales_moneda_local: Number(event.target.value) }))}>
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
          <div className="config-section-field">
            <label htmlFor="decimales-usd">{t('config_decimals_usd')}</label>
            <select id="decimales-usd" value={prefs.decimales_segunda_moneda} onChange={(event) => setPrefs((current) => ({ ...current, decimales_segunda_moneda: Number(event.target.value) }))}>
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
          <div className="config-section-field">
            <label htmlFor="separador-miles">{t('config_thousands_separator')}</label>
            <select id="separador-miles" value={prefs.separador_miles} onChange={(event) => setPrefs((current) => ({ ...current, separador_miles: event.target.value }))}>
              <option value=".">.</option>
              <option value=",">,</option>
              <option value=" ">{t('config_separator_space')}</option>
            </select>
          </div>
          <div className="config-section-field">
            <label htmlFor="separador-decimal">{t('config_decimal_separator')}</label>
            <select id="separador-decimal" value={prefs.separador_decimal} onChange={(event) => setPrefs((current) => ({ ...current, separador_decimal: event.target.value }))}>
              <option value=",">,</option>
              <option value=".">.</option>
            </select>
          </div>
          <div className="config-section-row">
            <span>{t('config_preview')}</span>
            <span>{region.moneda_default} {preview}</span>
          </div>
          <button type="button" className="config-section-save" disabled={saving || loading} onClick={save}>
            {saving ? t('btn_saving') : t('btn_save_changes')}
          </button>
        </article>
      </section>
    </main>
  )
}

export default RegionFormatoPage
