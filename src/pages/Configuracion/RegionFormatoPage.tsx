import { useCallback, useEffect, useState } from 'react'
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
 * Per-currency number format, as resolved by fn_obtener_formato_moneda (P3
 * deploy 78): a map {CODE: {decimales, separador_miles, separador_decimal}} that
 * is never missing an active currency of the user.
 */
interface CurrencyFormatEntry {
  decimales: number
  separador_miles: string
  separador_decimal: string
}

type CurrencyFormatMap = Record<string, CurrencyFormatEntry>

// fn_configurar_formato_moneda accepts 0-4 decimals; the card exposes the range
// the owner uses today.
const DECIMALS_VALUES = [0, 1, 2]
const THOUSANDS_SEPARATOR_VALUES = ['.', ',', ' ']

/**
 * 0-2 is the range the legacy block offered, but a catalog currency can come
 * with 3-4 decimals (KWD, BHD, CLF). The current value is always kept as an
 * option so the select never renders a value it cannot show.
 */
function decimalsOptions(entry: CurrencyFormatEntry): number[] {
  return DECIMALS_VALUES.includes(entry.decimales)
    ? DECIMALS_VALUES
    : [...DECIMALS_VALUES, entry.decimales].sort((a, b) => a - b)
}

/** Validates one entry of the jsonb map; anything malformed is dropped. */
function normalizeFormatEntry(value: unknown): CurrencyFormatEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const decimales = Number(row.decimales)
  if (!Number.isFinite(decimales)) return null
  return {
    decimales,
    separador_miles:
      typeof row.separador_miles === 'string' ? row.separador_miles : DEFAULT_PREFS.separador_miles,
    separador_decimal:
      typeof row.separador_decimal === 'string' ? row.separador_decimal : DEFAULT_PREFS.separador_decimal,
  }
}

/**
 * Normalizes the RPC answer and guarantees the two slots the user always has.
 * fn_obtener_formato_moneda already returns local + USD, but the app is a PWA:
 * when the read fails (offline, legacy account) the card still has to render
 * something usable, so local + USD inherit from p_preferencias_usuario — the very
 * same inheritance the RPC applies server-side. Nothing is computed here.
 */
function normalizeFormatMap(
  raw: unknown,
  localCode: string | null,
  prefs: UserPrefs,
): CurrencyFormatMap {
  const out: CurrencyFormatMap = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
      const entry = normalizeFormatEntry(value)
      if (entry && code.trim()) out[code.trim().toUpperCase()] = entry
    }
  }
  const local = (localCode ?? '').trim().toUpperCase()
  const legacy: CurrencyFormatEntry = {
    decimales: prefs.decimales_moneda_local,
    separador_miles: prefs.separador_miles,
    separador_decimal: prefs.separador_decimal,
  }
  if (local && !out[local]) out[local] = legacy
  if (local !== 'USD' && !out.USD) {
    out.USD = { ...legacy, decimales: prefs.decimales_segunda_moneda }
  }
  return out
}

/**
 * Slot order: local currency first, USD second (the default second currency,
 * S18), then the remaining active currencies. Postgres jsonb does NOT preserve
 * key order, so the order is decided here and never inherited from the object.
 */
function currencySlotOrder(localCode: string | null, formats: CurrencyFormatMap): string[] {
  const local = (localCode ?? '').trim().toUpperCase()
  const rest = Object.keys(formats)
    .filter((code) => code !== local)
    .sort((a, b) => {
      if (a === 'USD') return b === 'USD' ? 0 : -1
      if (b === 'USD') return 1
      return a.localeCompare(b)
    })
  return [local, ...rest]
}

/**
 * Per-group preview: the same sample amount written with that currency's own
 * decimals and thousands separator. Display only — no RPC and no math on money.
 */
function formatPreview(entry: CurrencyFormatEntry): string {
  const decimals = Math.min(4, Math.max(0, Math.floor(Number(entry.decimales) || 0)))
  return `1${entry.separador_miles}234${entry.separador_decimal}${'0'.repeat(decimals)}`
}

interface NumberFormatByCurrencyProps {
  paisCodigo: string | null
  localCode: string | null
  formats: CurrencyFormatMap
  lang: string
  onUpdate: (code: string, patch: Partial<CurrencyFormatEntry>) => void
}

/**
 * 'Formato de números' card, one group per currency (S2 / task U3). The owner's
 * ask: local decimals + local thousands separator, then a divider, then the same
 * for the second currency, then a divider and the same for the third one.
 *
 * The retired global block (one decimals pair + one separator pair for all
 * currencies) is gone: every value now belongs to one currency and is persisted
 * per currency through fn_configurar_formato_moneda.
 */
function NumberFormatByCurrency({
  paisCodigo,
  localCode,
  formats,
  lang,
  onUpdate,
}: NumberFormatByCurrencyProps) {
  const codes = currencySlotOrder(localCode, formats)
  // Three groups in owner order (S2). The label is always an i18n key: the card
  // never hardcodes a currency code as the label, the real code and name come
  // from the backend map. Built per render so a language change re-translates it.
  const slots = [
    { key: 'local', label: t('settings_fmt_local') },
    { key: 'second', label: t('settings_fmt_second') },
    { key: 'third', label: t('settings_fmt_third') },
  ]

  return (
    <article className="config-section-card">
      <h2>{t('config_format_numbers')}</h2>
      {slots.map((item, index) => {
        const code = codes[index] ?? ''
        const entry = code ? formats[code] : undefined
        return (
          <div key={item.key} className="config-section-fmt-group">
            {index > 0 ? <hr className="config-section-divider" /> : null}
            <div className="config-section-row">
              <span>{item.label}</span>
              <span>
                {index === 0 && paisCodigo ? `${flagEmoji(paisCodigo)} ` : ''}
                {code || '—'}
                {code ? ` · ${currencyName(code, lang)}` : ''}
              </span>
            </div>
            {code && entry ? (
              <>
                <div className="config-section-field">
                  <label htmlFor={`fmt-dec-${item.key}`}>{t('settings_fmt_decimals')}</label>
                  <select
                    id={`fmt-dec-${item.key}`}
                    value={entry.decimales}
                    onChange={(e) => onUpdate(code, { decimales: Number(e.target.value) })}
                  >
                    {decimalsOptions(entry).map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div className="config-section-field">
                  <label htmlFor={`fmt-sep-${item.key}`}>{t('config_thousands_separator')}</label>
                  <select
                    id={`fmt-sep-${item.key}`}
                    value={entry.separador_miles}
                    onChange={(e) => onUpdate(code, { separador_miles: e.target.value })}
                  >
                    {THOUSANDS_SEPARATOR_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {value === ' ' ? t('config_separator_space') : value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="config-section-row">
                  <span>{t('config_preview')}</span>
                  <span>{`${code} ${formatPreview(entry)}`}</span>
                </div>
              </>
            ) : (
              <div className="config-section-row">
                <span className="config-section-action-desc">{t('settings_fmt_third_desc')}</span>
              </div>
            )}
          </div>
        )
      })}
    </article>
  )
}

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

/**
 * CurrenciesBlock — reserved, structure-only slot for the multi-currency
 * configuration in Región y formato (feature: menu-ajustes, S18 / task T7).
 *
 * INTEGRATION POINT — agent P3, task T8 "monedas extra" (parallel, independent):
 *   · Spec:  odd/tasks/menu-ajustes.md (S18) + odd/tasks/monedas-extra-libres.md
 *   · Topic: coordination/p3-tercera-moneda (Engram)
 *   · Contract: T8 fills the second/third currency selectors and their format
 *     with its own monedas-extra RPCs (mirrors under funcionesSQL/). This block
 *     is the stable anchor: extend it in place. Do NOT mutate anything outside
 *     CurrenciesBlock, and do NOT wire the monedas-extra RPCs here before T8 —
 *     tests/regionCurrenciesBlock.test.js asserts their absence.
 *
 * Structure only: no state, no fetch, no handlers. The local currency is the
 * value the page already resolves; the second/third slots are placeholders.
 */
interface CurrenciesBlockProps {
  paisCodigo: string | null
  localCurrency: string | null
  lang: string
}

function CurrenciesBlock({ paisCodigo, localCurrency, lang }: CurrenciesBlockProps) {
  return (
    <article className="config-section-card">
      <h2>{t('settings_entry_currencies_block')}</h2>
      <p>{t('settings_entry_currencies_block_desc')}</p>

      {/* Moneda local — derivada del país, solo lectura (S18). */}
      <div className="config-section-row">
        <span>{t('config_currency_main')}</span>
        <span>
          {paisCodigo ? `${flagEmoji(paisCodigo)} ` : ''}
          {localCurrency || '—'}
          {localCurrency ? ` · ${currencyName(localCurrency, lang)}` : ''}
          <span className="config-section-action-desc">{t('settings_currencies_local_desc')}</span>
        </span>
      </div>

      {/* Segunda moneda — hoy fija en USD; T8 la vuelve seleccionable. */}
      <div className="config-section-row">
        <span>{t('config_currency_secondary')}</span>
        <span>
          USD
          <span className="config-section-action-desc">{t('settings_currencies_second_desc')}</span>
        </span>
      </div>

      {/* Tercera moneda — slot reservado, arranca vacío (S18). */}
      <div className="config-section-row">
        <span>{t('settings_currencies_third_label')}</span>
        <span>
          —
          <span className="config-section-action-desc">{t('settings_currencies_third_desc')}</span>
        </span>
      </div>
    </article>
  )
}

/**
 * Route-orphaned wrapper. The owner moved Región y formato into the hub as an
 * inline accordion card (S3), so /configuracion/region no longer exists and the
 * hub renders ConfigRegionBody directly. Kept exported so the module keeps the
 * page name and any direct importer never breaks silently.
 */
export function RegionFormatoPage() {
  return <ConfigRegionBody />
}

/**
 * S3 — inline body of the "Región y formato" card. Same content the standalone
 * page used to render (country/language, currency, the reserved CurrenciesBlock
 * anchor, the per-currency format card, first weekday and time format), minus the
 * page-level header and back button. The hub mounts it inside the region card.
 */
export function ConfigRegionBody() {
  const { showToast } = useToast()
  const { lang, setLang } = useLanguage()
  const userId = useOptionalAuth()?.session?.user?.id ?? null
  // The country is data, not code — but it is NOT editable here once the user is
  // logged in: it is the anchor of the regional derivation and of the frozen
  // currency math (decision del dueno). It reads from the confirmed region row;
  // only the language and the minor regional prefs change on this screen.
  const [region, setRegion] = useState<RegionPrefs | null>(null)
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS)
  // Per-currency format map resolved by the backend (fn_obtener_formato_moneda).
  const [formats, setFormats] = useState<CurrencyFormatMap>({})

  const loadConfig = useCallback(async (cancelledRef: { cancelled: boolean }) => {
    const [regionData, prefsData, formatData] = await Promise.all([
      rpc<RegionPrefs[]>('fn_obtener_region_usuario').catch(() => [] as RegionPrefs[]),
      rpc<UserPrefs[]>('fn_obtener_preferencias_usuario').catch(() => [] as UserPrefs[]),
      rpc<CurrencyFormatMap>('fn_obtener_formato_moneda').catch(() => null),
    ])
    if (cancelledRef.cancelled) return
    const regionRow = Array.isArray(regionData) ? regionData[0] : null
    const prefsRow = Array.isArray(prefsData) ? prefsData[0] : null
    const nextPrefs = { ...DEFAULT_PREFS, ...(prefsRow ?? {}) }
    setRegion(regionRow ? { ...regionRow } : null)
    setPrefs(nextPrefs)
    setFormats(normalizeFormatMap(formatData, regionRow?.moneda_default ?? null, nextPrefs))
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

  /**
   * Per-currency write (S2/U3). Optimistic: the select reflects the change in
   * the same tick, and if fn_configurar_formato_moneda rejects it (separators
   * equal, inactive currency) the previous map is restored and the reason is
   * shown — the UI never diverges silently from the backend.
   *
   * The RPC's return value is intentionally NOT applied: it echoes the raw
   * monedas_formateo overrides store, not the resolved map the card renders.
   */
  const updateCurrencyFormat = async (code: string, patch: Partial<CurrencyFormatEntry>) => {
    const current = formats[code]
    if (!current) return
    const previous = formats
    const next = { ...formats, [code]: { ...current, ...patch } }
    setFormats(next)
    try {
      await rpc('fn_configurar_formato_moneda', {
        p_moneda: code,
        p_decimales: next[code].decimales,
        p_separador_miles: next[code].separador_miles,
        p_separador_decimal: next[code].separador_decimal,
      })
    } catch (err) {
      setFormats(previous)
      showToast(parseError(err), 'error')
    }
  }

  return (
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

        {/* Monedas — reserved block (S18). P3/T8 integration point:
            extend ONLY the CurrenciesBlock component. */}
        <CurrenciesBlock
          paisCodigo={region?.pais_codigo ?? null}
          localCurrency={region?.moneda_default ?? null}
          lang={lang}
        />

        {/* Formato de números — one group per currency (S2/U3). The resolved map
            and the write live in the backend: fn_obtener_formato_moneda /
            fn_configurar_formato_moneda (P3 deploy 78). */}
        <NumberFormatByCurrency
          paisCodigo={region?.pais_codigo ?? null}
          localCode={region?.moneda_default ?? null}
          formats={formats}
          lang={lang}
          onUpdate={updateCurrencyFormat}
        />

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
  )
}

export default RegionFormatoPage