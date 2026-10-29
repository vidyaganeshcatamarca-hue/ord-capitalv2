import { useEffect, useState, type FormEvent } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import { useNumberFormat } from '@/hooks/useNumberFormat'
import { useMonedasExtra } from '@/hooks/useMonedasExtra'
import { buildWalletCurrencyOptions } from '@/lib/monedasExtra'
import { NUMERIC_INPUT_ENTER_PROPS } from '@/lib/numericKeyboard'
import './NuevaInversionModal.css'
import { useFormatRevision } from '@/hooks/useFormatRevision'

export interface BilleteraResumen {
  billetera_id: number
  nombre: string
  saldo: number
  moneda: string
}

interface NuevaInversionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (inversionId: number) => void
  billeteras: BilleteraResumen[]
}

type TipoActivo = 'plazo_fijo' | 'cripto' | 'cedear' | 'acciones' | 'otro'

// S1: la posición puede venir de una billetera (compra de hoy) o existir desde
// antes de la app. En el segundo caso no hay egreso: solo se registra el valor
// actual y desde cuándo la tiene.
type TipoOrigen = 'billetera' | 'existente'

// Fecha local en YYYY-MM-DD: toISOString() pasa a UTC y en husos negativos
// devuelve el día siguiente.
function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TIPO_OPCIONES: { value: TipoActivo; key: string }[] = [
  { value: 'plazo_fijo', key: 'type_plazo_fijo' },
  { value: 'cripto', key: 'type_cripto' },
  { value: 'cedear', key: 'type_cedear' },
  { value: 'acciones', key: 'type_acciones' },
  { value: 'otro', key: 'type_otro' },
]

export function NuevaInversionModal({
  isOpen,
  onClose,
  onSuccess,
  billeteras,
}: NuevaInversionModalProps) {
  // Formato por moneda: se re-renderiza cuando cambia el contexto.
  useFormatRevision()
  const { showToast } = useToast()
  // S21: las monedas de inversión son las del usuario (local + extras), no el
  // par ARS/USD fijo. buildWalletCurrencyOptions ya está testeado (T2).
  const { localCurrency } = useNumberFormat()
  const { extras } = useMonedasExtra()
  const monedasOptions = buildWalletCurrencyOptions(localCurrency, extras)

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoActivo>('plazo_fijo')
  const [tipoOrigen, setTipoOrigen] = useState<TipoOrigen>('billetera')
  const [fechaInicio, setFechaInicio] = useState('')
  const [tasa, setTasa] = useState('')
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState('')
  const [billeteraId, setBilleteraId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setNombre('')
      setTipo('plazo_fijo')
      setTipoOrigen('billetera')
      setFechaInicio('')
      setTasa('')
      setMonto('')
      setMoneda('')
      setBilleteraId('')
      setSubmitting(false)
      setTouched(false)
      return
    }
    // Moneda default = la del usuario (local); sin región, la primera del set.
    if (moneda === '' ) {
      const inicial = localCurrency || monedasOptions[0] || ''
      if (inicial) setMoneda(inicial)
    }
    // La billetera de origen se elige sola solo si hay una de la moneda: la
    // que tenga MAS saldo (la que puede cubrir la inversion). Si no hay
    // ninguna, el usuario tiene que crearla antes.
    if (moneda) {
      const candidatas = billeteras
        .filter((b) => b.moneda === moneda)
        .sort((a, b) => Number(b.saldo) - Number(a.saldo))
      const actual = candidatas.find((b) => String(b.billetera_id) === billeteraId)
      if (actual) {
        setBilleteraId(String(actual.billetera_id))
      } else if (candidatas.length > 0) {
        setBilleteraId(String(candidatas[0].billetera_id))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, billeteras, moneda, localCurrency, monedasOptions])

  const montoNum = Number(monto) || 0
  const tasaNum = Number(tasa) || 0
  const esExistente = tipoOrigen === 'existente'
  const nombreOk = nombre.trim().length > 0
  const montoOk = montoNum > 0
  // S6: una posición preexistente trae su valor actual explícito y no devenga,
  // así que la TNA solo se pide cuando la inversión sale de una billetera.
  const tasaOk = esExistente || tipo !== 'plazo_fijo' || tasaNum > 0
  // S4: la fecha es obligatoria en el modo preexistente. El input ya acota el
  // máximo a hoy, pero se valida igual porque puede venir tipeada.
  const fechaOk = !esExistente || (fechaInicio !== '' && fechaInicio <= hoyISO())

  // B2 (2026-10-21): solo se ofrecen billeteras de la moneda elegida Y con
  // saldo suficiente para el monto. Antes se listaban todas las de la moneda
  // y el backend no validaba el saldo: se podia invertir 50.000 con 1.679 en
  // la cuenta y la billetera quedaba en negativo.
  const billeterasDeLaMoneda = billeteras.filter((b) => b.moneda === moneda)
  const billeterasElegibles = montoNum > 0
    ? billeterasDeLaMoneda.filter((b) => Number(b.saldo) >= montoNum)
    : billeterasDeLaMoneda
  const billeteraElegibleActual = billeteraId
    ? billeterasElegibles.find((b) => String(b.billetera_id) === billeteraId) ?? null
    : null
  // Sin monto escrito todavia no hay saldo que comparar: no hay error.
  const hayBilleterasDeLaMoneda = billeterasDeLaMoneda.length > 0
  // S1: sin billetera no hay saldo que cubrir ni cuenta de la que descontar.
  const billeteraOk = esExistente || (billeteraId !== '' && billeteraElegibleActual !== null)
  const isValid = nombreOk && montoOk && tasaOk && billeteraOk && fechaOk

  const showNombreError = touched && !nombreOk
  const showMontoError = touched && !montoOk
  const showTasaError = touched && !esExistente && tipo === 'plazo_fijo' && !tasaOk
  const showFechaError = touched && esExistente && !fechaOk

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!isValid || submitting) return
    setSubmitting(true)
    try {
      const tasaValue = !esExistente && tipo === 'plazo_fijo' ? tasaNum : 0
      const result = await rpc<number>('fn_crear_inversion', {
        p_nombre_activo: nombre.trim(),
        p_monto: montoNum,
        p_tasa_anual_tna: tasaValue,
        // S1: sin billetera el backend no escribe el egreso en p_caja.
        p_billetera_origen_id: esExistente ? null : Number(billeteraId),
        p_moneda: moneda,
        p_tipo_activo: tipo,
        // Solo viaja en el modo preexistente: el alta desde billetera mantiene
        // su fecha de hoy, igual que antes.
        ...(esExistente ? { p_fecha_inicio: fechaInicio } : {}),
      })
      showToast(t('msg_investment_created'), 'success')
      onSuccess?.(result)
      onClose()
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="nueva-inversion-modal-overlay" onClick={onClose}>
      <div
        className="nueva-inversion-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="nueva-inversion-modal-header">
          <h3 className="nueva-inversion-modal-title">{t('modal_new_title')}</h3>
          <button
            type="button"
            className="nueva-inversion-modal-close"
            onClick={onClose}
            aria-label={t('btn_close')}
          >
            ×
          </button>
        </header>

        <form
          id="nueva-inversion-form"
          onSubmit={handleSubmit}
          className="nueva-inversion-modal-form"
        >
          <div className="form-group">
            <label className="form-label">{t('label_investment_origin')}</label>
            <div className="nueva-inversion-tipo-group nueva-inversion-origen-group">
              {([
                { value: 'billetera' as const, key: 'origin_from_wallet' },
                { value: 'existente' as const, key: 'origin_already_owned' },
              ]).map((opt) => (
                <label
                  key={opt.value}
                  className={`nueva-inversion-tipo-option ${
                    tipoOrigen === opt.value ? 'nueva-inversion-tipo-option--active' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="origen_inversion"
                    value={opt.value}
                    checked={tipoOrigen === opt.value}
                    onChange={() => {
                      setTipoOrigen(opt.value)
                      if (opt.value === 'existente' && fechaInicio === '') {
                        setFechaInicio(hoyISO())
                      }
                    }}
                    disabled={submitting}
                  />
                  <span>{t(opt.key)}</span>
                </label>
              ))}
            </div>
            {esExistente && (
              // S5: billeteras no son inversiones. La línea fija la frontera y
              // evita que el usuario crea que tiene que cargar la plata antes.
              <span className="form-hint">{t('helper_existing_investment')}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="nuevainversion-label-active-name">{t('label_active_name')}</label>
            <input id="nuevainversion-label-active-name"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={submitting}
              required
              {...NUMERIC_INPUT_ENTER_PROPS}
            />
            {/* B4 (2026-10-21): el ejemplo estaba como placeholder y parecia
                un valor ya escrito. Ahora va debajo, chiquito, donde antes
                aparecia el error de campo obligatorio. */}
            <span className="form-hint">{t('placeholder_active_name')}</span>
            {showNombreError && (
              <span className="form-error">{t('field_required')}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">{t('label_type')}</label>
            <div className="nueva-inversion-tipo-group">
              {TIPO_OPCIONES.map((opt) => (
                <label
                  key={opt.value}
                  className={`nueva-inversion-tipo-option ${
                    tipo === opt.value ? 'nueva-inversion-tipo-option--active' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="tipo_activo"
                    value={opt.value}
                    checked={tipo === opt.value}
                    onChange={() => setTipo(opt.value)}
                    disabled={submitting}
                  />
                  <span>{t(opt.key)}</span>
                </label>
              ))}
            </div>
          </div>

          {tipo === 'plazo_fijo' && !esExistente && (
            <div className="form-group">
              <label className="form-label" htmlFor="nuevainversion-label-tna">{t('label_tna')}</label>
              <input id="nuevainversion-label-tna"
                type="number"
                step="0.01"
                min="0"
                value={tasa}
                onChange={(e) => setTasa(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={t('placeholder_tna')}
                disabled={submitting}
                required
                {...NUMERIC_INPUT_ENTER_PROPS}
              />
              {showTasaError && (
                <span className="form-error">{t('error_fixed_term_requires_tna')}</span>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="nuevainversion-label-amount">
              {esExistente ? t('label_current_value') : t('label_amount')}
            </label>
            <input id="nuevainversion-label-amount"
              type="number"
              step="0.01"
              min="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={t('placeholder_amount')}
              disabled={submitting}
              required
              {...NUMERIC_INPUT_ENTER_PROPS}
            />
            {showMontoError && (
              <span className="form-error">{t('error_amount_zero')}</span>
            )}
            {esExistente && (
              <span className="form-hint">{t('helper_existing_value')}</span>
            )}
          </div>

          {esExistente && (
            <div className="form-group">
              <label className="form-label" htmlFor="nuevainversion-label-fecha-inicio">
                {t('label_start_date')}
              </label>
              <input id="nuevainversion-label-fecha-inicio"
                type="date"
                value={fechaInicio}
                max={hoyISO()}
                onChange={(e) => setFechaInicio(e.target.value)}
                onBlur={() => setTouched(true)}
                disabled={submitting}
                required
              />
              {showFechaError && (
                <span className="form-error">{t('error_investment_start_date_future')}</span>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">{t('label_currency')}</label>
            <div className="nueva-inversion-moneda-group">
              {monedasOptions.map((m) => (
                <label
                  key={m}
                  className={`nueva-inversion-moneda-option ${
                    moneda === m ? 'nueva-inversion-moneda-option--active' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="moneda"
                    value={m}
                    checked={moneda === m}
                    onChange={() => setMoneda(m)}
                    disabled={submitting}
                  />
                  <span>{m}</span>
                </label>
              ))}
            </div>
          </div>

          {!esExistente && (
          <div className="form-group">
            <label className="form-label" htmlFor="nuevainversion-billetera-origen">{t('label_source_wallet')}</label>
            <select id="nuevainversion-billetera-origen"
              value={billeteraId}
              onChange={(e) => setBilleteraId(e.target.value)}
              disabled={submitting || billeterasElegibles.length === 0}
              required
            >
              <option value="" disabled>{t('placeholder_select_wallet')}</option>
              {billeteraId && !billeteraElegibleActual && (
                // La billetera elegida quedo sin saldo (o cambio el monto): se
                // avisa en vez de dejarla seleccionada a ciegas.
                <option value={billeteraId}>
                  {t('label_source_wallet')} — {t('error_wallet_insufficient_balance')}
                </option>
              )}
              {billeterasElegibles.map((b) => (
                <option key={b.billetera_id} value={b.billetera_id}>
                  {t(b.nombre)} — {formatCurrency(b.saldo, b.moneda)}
                </option>
              ))}
            </select>
            {billeteraElegibleActual === null && (
              <span className="form-error">{t('error_no_wallets_with_balance')}</span>
            )}
          </div>
          )}

          <p className="nueva-inversion-modal-disclaimer">
            {esExistente ? t('disclaimer_existing_investment') : t('disclaimer_new_investment')}
          </p>
        </form>

        {/* S9: las acciones viven FUERA del form (que es el scroller) para
            que "Guardar" quede siempre visible en el teléfono. El botón
            sigue submits el form gracias al atributo form="...". */}
        <div className="nueva-inversion-modal-actions">
          <button
            type="button"
            className="btn btn-ghost font-semibold"
            onClick={onClose}
            disabled={submitting}
          >
            {t('btn_cancel')}
          </button>
          <button
            type="submit"
            form="nueva-inversion-form"
            className="btn btn-primary font-semibold"
            disabled={!isValid || submitting}
          >
            {submitting ? t('loading') : t('btn_save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default NuevaInversionModal
