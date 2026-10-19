// components/configuracion/BloqueMonedas.tsx
// ============================================
// The "Monedas" block of Región y formato (S18 peer / S13-S15 dueño).
//
// Three slots: the local currency (read-only, derived from the country), the
// second currency and the third one — both user-configurable over the QUOTED
// catalog only (S9: no rate, no option). Slot 2 starts preselected as USD
// (S13); slot 3 starts empty. The persisted source of truth is
// fn_configurar_monedas_extra(text[]) (T1), which enforces: catalog check,
// not-local, no duplicates, max 2, and the removal guard (S14) that blocks
// dropping an extra with active wallets — its error message shows the culprit.
// Decimales por moneda (S22) stay in the existing number-format sliders until
// the per-currency preference migration lands (T8b).
import { useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { useToast } from '@/contexts/ToastContext'
import { useLanguage } from '@/locales/LanguageProvider'
import { useCountryCatalog } from '@/lib/useCountryCatalog'
import { CountrySearchModal } from '@/components/onboarding/CountrySearchModal'
import { type Country } from '@/lib/countryCatalog'
import { useMonedasExtra } from '@/hooks/useMonedasExtra'
import { parseJsonbStringArray } from '@/lib/jsonbRpc'
import { buildWalletCurrencyOptions } from '@/lib/monedasExtra'
import { useDivisasCotizadas } from '@/hooks/useDivisasCotizadas'
import { currencyName } from '@/lib/countryCatalog'
import { useNumberFormat } from '@/hooks/useNumberFormat'

interface BloqueMonedasProps {
  localCurrency: string
  onSaved: () => void
}

export function BloqueMonedas({ localCurrency, onSaved }: BloqueMonedasProps) {
  const { showToast } = useToast()
  const { lang } = useLanguage()
  // reload: tras guardar, refetch real del hook (los componentes ya montados
  // en otra pantalla no ven el invalidate() solo: necesita un attempt++).
  const { extras, loading: extrasLoading, reload } = useMonedasExtra()
  const { divisas, loading: divisasLoading } = useDivisasCotizadas()
  // BUG4 del dueño: elegir por PAÍS en modal (país+moneda, sin nomenclatura).
  // Reutiliza el CountrySearchModal del onboarding y el catálogo cacheado.
  const { index, loading: catalogLoading } = useCountryCatalog()
  const [pickerSlot, setPickerSlot] = useState<2 | 3 | null>(null)

  const [slot2, setSlot2] = useState('')
  const [slot3, setSlot3] = useState('')
  const [saving, setSaving] = useState(false)

  // El país elegido manda su moneda: mismo camino que el select manual pero
  // sin tener que saberse el código ISO (BUG4: "elijo por país").
  const handleCountryPicked = (country: Country) => {
    const monedaPais = (country.localCurrency || '').toUpperCase()
    setPickerSlot(null)
    if (!monedaPais || monedaPais === localCurrency.toUpperCase()) return
    if (pickerSlot === 2) {
      const next3 = monedaPais === slot3 ? slot2 : slot3
      if (monedaPais === slot3 && slot3) setSlot3('')
      setSlot2(monedaPais)
      void handleSave(slot2, slot3, monedaPais, next3)
    } else {
      if (monedaPais === slot2) {
        // Si el país aporta la moneda que ya es 2ª, la 2ª se libera para la 3ª:
        // mismo swap que el select manual.
        setSlot3(slot2)
        setSlot2('')
        void handleSave(slot2, slot3, '', slot2)
        return
      }
      setSlot3(monedaPais)
      void handleSave(slot2, slot3, slot2, monedaPais)
    }
  }
  // Local state mirrors the persisted extras; resets when they load/refresh.
  useEffect(() => {
    setSlot2(extras[0] ?? '')
    setSlot3(extras[1] ?? '')
  }, [extras])

  // Option list per slot: empty first (slot 3 may stay unset; slot 2 has the
  // "remove" option), then the quoted catalog minus what the OTHER slot holds.
  // The local currency is never an extra (S10): buildWalletCurrencyOptions
  // filters it inside slot sets but here both slots are pure extras slots, so
  // the local exclusion happens explicitly.
  const catalogoFiltrado = useMemo(() => {
    const skip = new Set([localCurrency.toUpperCase()])
    const other = slot2 || slot3
    if (other) skip.add(other.toUpperCase())
    return divisas.filter((c) => !skip.has(c.toUpperCase()))
  }, [divisas, localCurrency, slot2, slot3])

  const handleSave = async (orig2: string, orig3: string, next2: string, next3: string) => {
    const nextArr = [next2, next3].filter(Boolean).filter((c, i, arr) => arr.indexOf(c) === i)
    setSaving(true)
    try {
      // fn_configurar_monedas_extra DEVUELVE el set normalizado persistido: los
      // slots se sincronizan con la respuesta real del backend (no con el
      // estado optimista), y reload() refresca el cache del hook para el resto
      // de la app. BUG 1b del dueño: sin esto, la página abierta seguía
      // mostrando las extras viejas ('no la está trayendo del lugar correcto').
      // RETURN jsonb: el parse puro cubre las 4 formas (tanda 2/BUG3: el
      // parser viejo asumía wrapper y con array puro dejaba los slots vacíos).
      const res = await rpc<unknown>('fn_configurar_monedas_extra', { p_monedas: nextArr })
      const codes = parseJsonbStringArray(res, 'fn_configurar_monedas_extra') ?? []
      setSlot2(codes[0] ?? '')
      setSlot3(codes[1] ?? '')
      showToast(t('monedas_extras_guardado'), 'success')
      onSaved()
      reload()
    } catch (err) {
      // Los slots vuelven al estado REAL persistido: la UI no miente.
      setSlot2(orig2)
      setSlot3(orig3)
      showToast(parseError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (extrasLoading || divisasLoading) return null

  return (
    <>
      {/* Primera moneda: READ-ONLY arriba del todo (the owner asked for this
          row; the rest are the two selectable extra slots). */}
      <div className="config-section-row">
        <span>{t('config_currency_main')}</span>
        <span>
          {localCurrency || '—'}
          {localCurrency ? ` · ${currencyName(localCurrency, lang)}` : ''}
          <span className="config-section-action-desc">{t('settings_currencies_local_desc')}</span>
        </span>
      </div>
      <div className="config-section-row">
        <span>{t('config_currency_secondary')}</span>
        <select
          className="config-section-select"
          aria-label={t('config_currency_secondary')}
          value={slot2}
          onChange={(e) => {
            const next = e.target.value
            // Swap rule: if slot takes slot 3's value, slot 3 frees up.
            const next3 = next === slot3 ? slot2 : slot3
            if (next && next === slot3) setSlot3(slot2)
            setSlot2(next)
            void handleSave(slot2, slot3, next, next3)
          }}
          disabled={saving}
        >
          <option value="">{t('monedas_extras_vacia')}</option>
          {(slot2 ? [slot2, ...catalogoFiltrado] : [localCurrency, ...catalogoFiltrado]).map(
            (code) => (
              <option key={code} value={code}>
                {flaglessName(code, lang)}
              </option>
            )
          )}
        </select>
        <button
          type="button"
          className="currencies-block-picker-toggle"
          onClick={() => setPickerSlot(2)}
          disabled={saving || catalogLoading}
          title={t('monedas_extras_elegir_por_pais')}
        >
          {t('monedas_extras_elegir_por_pais')}
        </button>
      </div>
      <div className="config-section-row">
        <span>{t('config_tercera_moneda')}</span>
        <select
          className="config-section-select"
          aria-label={t('config_tercera_moneda')}
          value={slot3}
          onChange={(e) => {
            void handleSave(slot2, slot3, slot2, e.target.value)
          }}
          disabled={saving}
        >
          <option value="">{t('monedas_extras_vacia')}</option>
          {(slot3 ? [slot3, ...catalogoFiltrado] : catalogoFiltrado).map((code) => (
            <option key={code} value={code}>
              {flaglessName(code, lang)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="currencies-block-picker-toggle"
          onClick={() => setPickerSlot(3)}
          disabled={saving || catalogLoading}
          title={t('monedas_extras_elegir_por_pais')}
        >
          {t('monedas_extras_elegir_por_pais')}
        </button>
      </div>
      <CountrySearchModal
        open={pickerSlot !== null}
        index={index}
        lang={lang}
        onClose={() => setPickerSlot(null)}
        onSelect={handleCountryPicked}
      />
    </>
  )
}

function flaglessName(code: string, lang: string): string {
  return `${currencyName(code, lang)} · ${code}`
}