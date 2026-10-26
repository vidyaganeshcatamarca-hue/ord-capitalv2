import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import type { BilleteraDestino } from './LiquidarInversionModal'
import './ActualizarValorModal.css'
import { useFormatRevision } from '@/hooks/useFormatRevision'

// S6 (ronda 5, dueño): "Cada inversión me permite retirar dinero completo, liquidándola o
// hacer retiros parciales. Pero en ningún lugar tengo la opción de agregar dinero a una
// inversión. [...] puedo comprar más bitcoins del mismo tipo. Y eso no debería registrarse
// como una nueva inversión, sino que la podría poder agregar a una inversión ya hecha."
//
// Es el espejo de Liquidar: el dinero sale de una billetera de la MISMA moneda que la
// inversión (nunca se convierten monedas en silencio) y sube el capital de esa inversión,
// sin crear una nueva y sin tocar el valor de mercado: cuánto vale hoy la posición lo sabe
// el dueño y lo carga con "Update value".

interface InversionResumen {
  inversion_id: number
  nombre_activo: string
  monto_invertido_original: number
  moneda: string
}

interface AportarCapitalModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  inversion: InversionResumen | null
  billeteras: BilleteraDestino[]
}

export function AportarCapitalModal({
  isOpen,
  onClose,
  onSuccess,
  inversion,
  billeteras,
}: AportarCapitalModalProps) {
  useFormatRevision()
  const { showToast } = useToast()

  const [monto, setMonto] = useState('')
  const [billeteraId, setBilleteraId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)

  const moneda = inversion?.moneda || 'ARS'
  const billeterasMismaMoneda = useMemo(
    () => billeteras.filter((b) => (b.moneda || '').toUpperCase() === moneda.toUpperCase()),
    [billeteras, moneda]
  )

  useEffect(() => {
    if (!isOpen) {
      setMonto('')
      setBilleteraId('')
      setSubmitting(false)
      setTouched(false)
      return
    }
    // Preselección: la primera billetera de la misma moneda, que es el caso normal.
    if (!billeteraId && billeterasMismaMoneda.length > 0) {
      setBilleteraId(String(billeterasMismaMoneda[0].billetera_id))
    }
  }, [isOpen, billeterasMismaMoneda, billeteraId])

  const montoNum = Number(monto) || 0
  const isValid = monto.trim() !== '' && montoNum > 0 && billeteraId !== ''
  const showError = touched && !isValid
  const sinBilleteras = billeterasMismaMoneda.length === 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!isValid || submitting || !inversion) return
    setSubmitting(true)
    try {
      await rpc('fn_aportar_inversion', {
        p_inversion_id: inversion.inversion_id,
        p_monto: montoNum,
        p_billetera_origen_id: Number(billeteraId),
      })
      showToast(t('msg_capital_added'), 'success')
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
    <div className="actualizar-valor-modal-overlay" onClick={onClose}>
      <div className="actualizar-valor-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="actualizar-valor-modal-header">
          <h3 className="actualizar-valor-modal-title">{t('modal_add_capital_title')}</h3>
          <button
            type="button"
            className="actualizar-valor-modal-close"
            onClick={onClose}
            aria-label={t('btn_close')}
          >
            ✕
          </button>
        </div>

        <form className="actualizar-valor-modal-form" onSubmit={handleSubmit}>
          <div className="actualizar-valor-modal-summary">
            <div className="actualizar-valor-modal-summary-row">
              <span className="actualizar-valor-modal-summary-label">{t('label_active_name')}</span>
              <span className="actualizar-valor-modal-summary-value">{inversion.nombre_activo}</span>
            </div>
            <div className="actualizar-valor-modal-summary-row">
              <span className="actualizar-valor-modal-summary-label">{t('label_capital')}</span>
              <span className="actualizar-valor-modal-summary-value">
                {formatCurrency(inversion.monto_invertido_original, moneda)}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="aportar-monto">{t('label_amount')}</label>
            <input
              id="aportar-monto"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder={t('placeholder_amount')}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="aportar-billetera">{t('label_source_wallet')}</label>
            <select
              id="aportar-billetera"
              value={billeteraId}
              onChange={(e) => setBilleteraId(e.target.value)}
              disabled={sinBilleteras}
            >
              {sinBilleteras && <option value="">{t('error_no_wallets_for_currency')}</option>}
              {billeterasMismaMoneda.map((b) => (
                <option key={b.billetera_id} value={String(b.billetera_id)}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </div>

          {showError && (
            <p className="form-error">
              {sinBilleteras ? t('error_no_wallets_for_currency') : t('error_amount_zero')}
            </p>
          )}

          <div className="actualizar-valor-modal-actions">
            <button type="button" className="btn btn-ghost font-semibold" onClick={onClose} disabled={submitting}>
              {t('btn_cancel')}
            </button>
            <button type="submit" className="btn btn-primary font-semibold" disabled={submitting || sinBilleteras}>
              {t('btn_add_capital')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
