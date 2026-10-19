// components/configuracion/BloqueMonedas.tsx
// ============================================
// The "Monedas" block of Región y formato (S18 peer / S13-S15 dueño).
//
// Three slots: the local currency (read-only, derived from the country), the
// second and the third one. Tanda 3 (owner): NO dropdown and NO separate
// button — each slot renders as an editable-looking field that itself opens
// the country picker modal; the assigned value shows currency name + code.
// The persisted source of truth is
// fn_configurar_monedas_extra(text[]) (T1), which enforces: catalog check,
// not-local, no duplicates, max 2, and the removal guard (S14) that blocks
// dropping an extra with active wallets — its error message shows the culprit.
// Decimales por moneda (S22) stay in the existing number-format sliders until
// the per-currency preference migration lands (T8b).
import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { parseError, t } from '@/locales/i18n'
import { useToast } from '@/contexts/ToastContext'
import { useLanguage } from '@/locales/LanguageProvider'
import { useCountryCatalog } from '@/lib/useCountryCatalog'
import { CountrySearchModal } from '@/components/onboarding/CountrySearchModal'
import { type Country } from '@/lib/countryCatalog'
import { useMonedasExtra } from '@/hooks/useMonedasExtra'
import { parseJsonbStringArray } from '@/lib/jsonbRpc'
import { currencyName } from '@/lib/countryCatalog'
import { formatCurrencyLabel } from '@/lib/monedasExtra'

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
  // Tanda 3 (owner): the field itself is the trigger — clicking it opens the
  // country picker modal (CountrySearchModal + the cached country catalog).
  const { index, loading: catalogLoading } = useCountryCatalog()
  const [pickerSlot, setPickerSlot] = useState<2 | 3 | null>(null)

  const [slot2, setSlot2] = useState('')
  const [slot3, setSlot3] = useState('')
  const [saving, setSaving] = useState(false)

  // The picked country brings its currency through the same persist path the
  // old select had (save + sync from the response + rollback on failure).
  const handleCountryPicked = (country: Country) => {
    const monedaPais = (country.localCurrency || '').toUpperCase()
    setPickerSlot(null)
    if (!monedaPais) return
    if (monedaPais === localCurrency.toUpperCase()) {
      // The local currency is never an extra (S10): say it instead of the old
      // silent ignore.
      showToast(t('monedas_extras_pais_local'), 'error')
      return
    }
  // If the slot already took slot 3's value, slot 3 frees up: same swap rule
  // the old select had.
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

  if (extrasLoading) return null

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
        {/* Tanda 3 (owner): a tappable field instead of a dropdown — the field
            itself opens the picker modal; the assigned value keeps showing
            currency name + code. */}
        <button
          type="button"
          className="config-section-select-trigger"
          aria-haspopup="dialog"
          aria-label={t('config_currency_secondary')}
          onClick={() => setPickerSlot(2)}
          disabled={saving || catalogLoading}
        >
          {slot2 ? flaglessName(slot2, lang) : t('monedas_extras_vacia')}
        </button>
        {slot2 && (
          <button
            type="button"
            className="config-section-clear"
            aria-label={t('monedas_extras_limpiar')}
            onClick={() => void handleSave(slot2, slot3, '', slot3)}
            disabled={saving}
          >
            ✕
          </button>
        )}
      </div>
      <div className="config-section-row">
        <span>{t('config_tercera_moneda')}</span>
        <button
          type="button"
          className="config-section-select-trigger"
          aria-haspopup="dialog"
          aria-label={t('config_tercera_moneda')}
          onClick={() => setPickerSlot(3)}
          disabled={saving || catalogLoading}
        >
          {slot3 ? flaglessName(slot3, lang) : t('monedas_extras_vacia')}
        </button>
        {slot3 && (
          <button
            type="button"
            className="config-section-clear"
            aria-label={t('monedas_extras_limpiar')}
            onClick={() => void handleSave(slot2, slot3, slot2, '')}
            disabled={saving}
          >
            ✕
          </button>
        )}
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
  // "franco suizo · CHF"; when the engine cannot resolve the name the label
  // degrades to the code alone (never 'BOB · BOB').
  return formatCurrencyLabel(currencyName(code, lang), code, '·')
}