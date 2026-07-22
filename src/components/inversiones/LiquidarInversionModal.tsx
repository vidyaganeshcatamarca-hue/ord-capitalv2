import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import './LiquidarInversionModal.css'

export interface BilleteraDestino {
  billetera_id: number
  nombre: string
  moneda: string
}

interface InversionResumen {
  inversion_id: number
  nombre_activo: string
  monto_invertido_original: number
  monto_liquidado: number
  valor_actual_teorico: number
  moneda: string
}

interface LiquidarInversionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  inversion: InversionResumen | null
  billeteras: BilleteraDestino[]
}

type LiquidacionTipo = 'total' | 'parcial'

export function LiquidarInversionModal({
  isOpen,
  onClose,
  onSuccess,
  inversion,
  billeteras,
}: LiquidarInversionModalProps) {
  const { showToast } = useToast()

  const [tipo, setTipo] = useState<LiquidacionTipo>('total')
  const [montoTotalRetirado, setMontoTotalRetirado] = useState('')
  const [montoRescate, setMontoRescate] = useState('')
  const [billeteraId, setBilleteraId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setTipo('total')
      setMontoTotalRetirado('')
      setMontoRescate('')
      setBilleteraId('')
      setSubmitting(false)
      setTouched(false)
      return
    }
    if (!inversion) return
    const mismaMoneda = billeteras.find((b) => b.moneda === inversion.moneda)
    if (mismaMoneda) setBilleteraId(String(mismaMoneda.billetera_id))
    if (tipo === 'total') {
      setMontoTotalRetirado(String(inversion.valor_actual_teorico ?? inversion.monto_invertido_original))
    } else {
      const restante = Math.max(
        0,
        (inversion.valor_actual_teorico ?? inversion.monto_invertido_original) -
          (inversion.monto_liquidado ?? 0),
      )
      setMontoRescate(String(restante > 0 ? restante : ''))
    }
  }, [isOpen, inversion, billeteras, tipo])

  const moneda = inversion?.moneda || 'ARS'
  const valorTeorico = inversion?.valor_actual_teorico ?? inversion?.monto_invertido_original ?? 0
  const montoOriginal = inversion?.monto_invertido_original ?? 0
  const liquidado = inversion?.monto_liquidado ?? 0
  const saldoRestante = Math.max(0, valorTeorico - liquidado)

  const totalNum = Number(montoTotalRetirado) || 0
  const rescateNum = Number(montoRescate) || 0

  const gananciaTotal = useMemo(() => totalNum - montoOriginal, [totalNum, montoOriginal])

  const totalOk = tipo !== 'total' || (montoTotalRetirado.trim() !== '' && totalNum >= 0)
  const rescateOk =
    tipo !== 'parcial' ||
    (montoRescate.trim() !== '' && rescateNum > 0 && rescateNum <= saldoRestante)
  const billeteraOk = billeteraId !== ''
  const isValid = totalOk && rescateOk && billeteraOk

  const showTotalError = touched && tipo === 'total' && !totalOk
  const showRescateError = touched && tipo === 'parcial' && !rescateOk
  const showRescateExceeds =
    touched && tipo === 'parcial' && montoRescate.trim() !== '' && rescateNum > saldoRestante
  const showBilleteraError = touched && !billeteraOk

  const billeterasMismaMoneda = billeteras.filter((b) => b.moneda === moneda)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!isValid || submitting || !inversion) return
    setSubmitting(true)
    try {
      if (tipo === 'total') {
        await rpc('fn_liquidar_inversion', {
          p_inversion_id: inversion.inversion_id,
          p_monto_total_retirado: totalNum,
          p_billetera_destino_id: Number(billeteraId),
        })
        showToast(t('msg_investment_liquidated'), 'success')
      } else {
        await rpc('fn_rescatar_inversion', {
          p_inversion_id: inversion.inversion_id,
          p_monto: rescateNum,
          p_billetera_destino_id: Number(billeteraId),
        })
        showToast(t('msg_investment_partial_rescued'), 'success')
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen || !inversion) return null

  return (
    <div className="liquidar-inversion-modal-overlay" onClick={onClose}>
      <div
        className="liquidar-inversion-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="liquidar-inversion-modal-header">
          <h3 className="liquidar-inversion-modal-title">{t('modal_liquidate_title')}</h3>
          <button
            type="button"
            className="liquidar-inversion-modal-close"
            onClick={onClose}
            aria-label={t('btn_close')}
          >
            ×
          </button>
        </header>

        <div className="liquidar-inversion-modal-summary">
          <div className="liquidar-inversion-modal-summary-row">
            <span className="liquidar-inversion-modal-summary-label">
              {t('label_active_name')}
            </span>
            <span className="liquidar-inversion-modal-summary-value">
              {inversion.nombre_activo}
            </span>
          </div>
          <div className="liquidar-inversion-modal-summary-row">
            <span className="liquidar-inversion-modal-summary-label">
              {t('label_capital')}
            </span>
            <span className="liquidar-inversion-modal-summary-value">
              {formatCurrency(montoOriginal, moneda)}
            </span>
          </div>
          <div className="liquidar-inversion-modal-summary-row">
            <span className="liquidar-inversion-modal-summary-label">
              {t('label_current_value')}
            </span>
            <span className="liquidar-inversion-modal-summary-value">
              {formatCurrency(valorTeorico, moneda)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="liquidar-inversion-modal-form">
          <div className="form-group">
            <label className="form-label">{t('label_type')}</label>
            <div className="liquidar-inversion-toggle-group">
              <button
                type="button"
                className={`liquidar-inversion-toggle-btn ${
                  tipo === 'total' ? 'liquidar-inversion-toggle-btn--active' : ''
                }`}
                onClick={() => setTipo('total')}
                disabled={submitting}
              >
                {t('modal_liquidate_total')}
              </button>
              <button
                type="button"
                className={`liquidar-inversion-toggle-btn ${
                  tipo === 'parcial' ? 'liquidar-inversion-toggle-btn--active' : ''
                }`}
                onClick={() => setTipo('parcial')}
                disabled={submitting}
              >
                {t('modal_liquidate_partial')}
              </button>
            </div>
          </div>

          {tipo === 'total' ? (
            <>
              <div className="form-group">
                <label className="form-label">{t('modal_liquidate_capital_label')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoTotalRetirado}
                  onChange={(e) => setMontoTotalRetirado(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder={t('placeholder_new_value')}
                  disabled={submitting}
                  required
                />
                <span className="liquidar-inversion-modal-helper">
                  {t('modal_liquidate_capital_helper')}
                </span>
                {showTotalError && (
                  <span className="form-error">{t('error_amount_zero')}</span>
                )}
              </div>
              <div className="liquidar-inversion-ganancia-block">
                <span className="liquidar-inversion-ganancia-label">
                  {t('modal_liquidate_gain_label')}
                </span>
                <span
                  className={`liquidar-inversion-ganancia-value ${
                    gananciaTotal > 0
                      ? 'liquidar-inversion-ganancia-value--positive'
                      : gananciaTotal < 0
                      ? 'liquidar-inversion-ganancia-value--negative'
                      : 'liquidar-inversion-ganancia-value--zero'
                  }`}
                >
                  {gananciaTotal > 0 ? '+' : ''}
                  {formatCurrency(gananciaTotal, moneda)}
                </span>
              </div>
            </>
          ) : (
            <div className="form-group">
              <label className="form-label">{t('modal_liquidate_amount_label')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={saldoRestante}
                value={montoRescate}
                onChange={(e) => setMontoRescate(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={t('placeholder_amount')}
                disabled={submitting}
                required
              />
              <span className="liquidar-inversion-modal-helper">
                {t('modal_liquidate_partial_helper')}
              </span>
              {showRescateExceeds && (
                <span className="form-error">
                  {t('modal_liquidate_partial_exceeds', { max: formatCurrency(saldoRestante, moneda) })}
                </span>
              )}
              {showRescateError && !showRescateExceeds && (
                <span className="form-error">{t('error_amount_zero')}</span>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">{t('label_destination_wallet')}</label>
            <select
              value={billeteraId}
              onChange={(e) => setBilleteraId(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={submitting || billeterasMismaMoneda.length === 0}
              required
            >
              <option value="">{t('placeholder_select_destination_wallet')}</option>
              {billeterasMismaMoneda.map((b) => (
                <option key={b.billetera_id} value={b.billetera_id}>
                  {t(b.nombre)}
                </option>
              ))}
            </select>
            {showBilleteraError && billeterasMismaMoneda.length === 0 && (
              <span className="form-error">{t('error_no_wallets_for_currency')}</span>
            )}
          </div>

          <div className="liquidar-inversion-modal-actions">
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

export default LiquidarInversionModal
