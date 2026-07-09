import { useEffect, useState, type FormEvent } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import './ActualizarValorModal.css'

interface InversionResumen {
  inversion_id: number
  nombre_activo: string
  valor_actual_teorico: number
  moneda: string
}

interface ActualizarValorModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  inversion: InversionResumen | null
}

export function ActualizarValorModal({
  isOpen,
  onClose,
  onSuccess,
  inversion,
}: ActualizarValorModalProps) {
  const { showToast } = useToast()

  const [nuevoValor, setNuevoValor] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setNuevoValor('')
      setSubmitting(false)
      setTouched(false)
    }
  }, [isOpen])

  const valorNum = Number(nuevoValor) || 0
  const isValid = valorNum >= 0 && nuevoValor.trim() !== ''
  const showError = touched && !isValid

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!isValid || submitting || !inversion) return
    setSubmitting(true)
    try {
      await rpc('fn_actualizar_valor_inversion', {
        p_inversion_id: inversion.inversion_id,
        p_nuevo_valor: valorNum,
      })
      showToast(t('msg_investment_updated'), 'success')
      onSuccess?.()
      onClose()
    } catch (err) {
      showToast(parseError(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen || !inversion) return null

  const moneda = inversion.moneda || 'ARS'

  return (
    <div className="actualizar-valor-modal-overlay" onClick={onClose}>
      <div
        className="actualizar-valor-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="actualizar-valor-modal-header">
          <h3 className="actualizar-valor-modal-title">{t('modal_update_value_title')}</h3>
          <button
            type="button"
            className="actualizar-valor-modal-close"
            onClick={onClose}
            aria-label={t('btn_close')}
          >
            ×
          </button>
        </header>

        <div className="actualizar-valor-modal-summary">
          <div className="actualizar-valor-modal-summary-row">
            <span className="actualizar-valor-modal-summary-label">
              {t('label_active_name')}
            </span>
            <span className="actualizar-valor-modal-summary-value">
              {inversion.nombre_activo}
            </span>
          </div>
          <div className="actualizar-valor-modal-summary-row">
            <span className="actualizar-valor-modal-summary-label">
              {t('label_previous_value')}
            </span>
            <span className="actualizar-valor-modal-summary-value">
              {formatCurrency(inversion.valor_actual_teorico, moneda)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="actualizar-valor-modal-form">
          <div className="form-group">
            <label className="form-label">{t('label_new_value')}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={nuevoValor}
              onChange={(e) => setNuevoValor(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={t('placeholder_new_value')}
              disabled={submitting}
              required
            />
            {showError && (
              <span className="form-error">{t('error_investment_value_negative')}</span>
            )}
          </div>

          <div className="actualizar-valor-modal-actions">
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

export default ActualizarValorModal
