import { useEffect, useState, type FormEvent } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import './NuevaInversionModal.css'

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
type Moneda = 'ARS' | 'USD'

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
  const { showToast } = useToast()

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoActivo>('plazo_fijo')
  const [tasa, setTasa] = useState('')
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('ARS')
  const [billeteraId, setBilleteraId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setNombre('')
      setTipo('plazo_fijo')
      setTasa('')
      setMonto('')
      setMoneda('ARS')
      setBilleteraId('')
      setSubmitting(false)
      setTouched(false)
      return
    }
    const mismaMoneda = billeteras.find((b) => b.moneda === 'ARS')
    if (mismaMoneda) setBilleteraId(String(mismaMoneda.billetera_id))
  }, [isOpen, billeteras])

  const montoNum = Number(monto) || 0
  const tasaNum = Number(tasa) || 0
  const nombreOk = nombre.trim().length > 0
  const montoOk = montoNum > 0
  const tasaOk = tipo !== 'plazo_fijo' || tasaNum > 0
  const billeteraOk = billeteraId !== ''
  const isValid = nombreOk && montoOk && tasaOk && billeteraOk

  const showNombreError = touched && !nombreOk
  const showMontoError = touched && !montoOk
  const showTasaError = touched && tipo === 'plazo_fijo' && !tasaOk

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!isValid || submitting) return
    setSubmitting(true)
    try {
      const tasaValue = tipo === 'plazo_fijo' ? tasaNum : 0
      const result = await rpc<number>('fn_crear_inversion', {
        p_nombre_activo: nombre.trim(),
        p_monto: montoNum,
        p_tasa_anual_tna: tasaValue,
        p_billetera_origen_id: Number(billeteraId),
        p_moneda: moneda,
        p_tipo_activo: tipo,
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

        <form onSubmit={handleSubmit} className="nueva-inversion-modal-form">
          <div className="form-group">
            <label className="form-label">{t('label_active_name')}</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={t('placeholder_active_name')}
              disabled={submitting}
              required
            />
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

          {tipo === 'plazo_fijo' && (
            <div className="form-group">
              <label className="form-label">{t('label_tna')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={tasa}
                onChange={(e) => setTasa(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={t('placeholder_tna')}
                disabled={submitting}
                required
              />
              {showTasaError && (
                <span className="form-error">{t('error_fixed_term_requires_tna')}</span>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">{t('label_amount')}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={t('placeholder_amount')}
              disabled={submitting}
              required
            />
            {showMontoError && (
              <span className="form-error">{t('error_amount_zero')}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">{t('label_currency')}</label>
            <div className="nueva-inversion-moneda-group">
              {(['ARS', 'USD'] as const).map((m) => (
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

          <div className="form-group">
            <label className="form-label">{t('label_source_wallet')}</label>
            <select
              value={billeteraId}
              onChange={(e) => setBilleteraId(e.target.value)}
              disabled={submitting || billeteras.length === 0}
              required
            >
              <option value="">{t('placeholder_select_wallet')}</option>
              {billeteras
                .filter((b) => b.moneda === moneda)
                .map((b) => (
                  <option key={b.billetera_id} value={b.billetera_id}>
                    {b.nombre} — {formatCurrency(b.saldo, b.moneda)}
                  </option>
                ))}
            </select>
            {billeteras.filter((b) => b.moneda === moneda).length === 0 && (
              <span className="form-error">{t('error_no_wallets_for_currency')}</span>
            )}
          </div>

          <p className="nueva-inversion-modal-disclaimer">
            {t('disclaimer_new_investment')}
          </p>

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
              className="btn btn-primary font-semibold"
              disabled={!isValid || submitting}
            >
              {submitting ? t('loading') : t('btn_save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NuevaInversionModal
