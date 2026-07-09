import { t } from '@/locales/i18n'
import { formatCurrency, formatNumber } from '@/lib/format'
import type { DeudaItem } from '@/pages/Saneamiento/SaneamientoPage'

interface SimularPagoModalProps {
  deuda: DeudaItem
  monto: number
  simulacion: {
    meses_actuales: number
    meses_con_pago_extra: number
    meses_ahorrados: number
    ahorro_intereses_estimado: number
    nuevo_saldo: number
  }
  isOpen: boolean
  onClose: () => void
  onConfirmar: () => void
}

export function SimularPagoModal({ deuda, monto, simulacion, isOpen, onClose, onConfirmar }: SimularPagoModalProps) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('saneamiento_simular_titulo')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="saneamiento-simulacion">
          <div className="saneamiento-sim-row">
            <span>{t('saneamiento_simular_pago_extra')}</span>
            <strong>{formatCurrency(monto, 'ARS')}</strong>
          </div>
          <div className="saneamiento-sim-row">
            <span>{t('saneamiento_simular_meses_actuales')}</span>
            <strong>{formatNumber(simulacion.meses_actuales)}</strong>
          </div>
          <div className="saneamiento-sim-row">
            <span>{t('saneamiento_simular_meses_con_extra')}</span>
            <strong>{formatNumber(simulacion.meses_con_pago_extra)}</strong>
          </div>
          <div className="saneamiento-sim-row destacado">
            <span>{t('saneamiento_simular_meses_ahorrados')}</span>
            <strong>{formatNumber(simulacion.meses_ahorrados)}</strong>
          </div>
          <div className="saneamiento-sim-row destacado">
            <span>{t('saneamiento_simular_intereses_ahorrados')}</span>
            <strong>{formatCurrency(simulacion.ahorro_intereses_estimado, 'ARS')}</strong>
          </div>
          <div className="saneamiento-sim-row">
            <span>{t('saneamiento_simular_nuevo_saldo')}</span>
            <strong>{formatCurrency(simulacion.nuevo_saldo, 'ARS')}</strong>
          </div>

          <div className="saneamiento-sim-aviso">
            ⚠️ {t('saneamiento_simular_aviso')}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('saneamiento_cancelar')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirmar}>
            {t('saneamiento_confirmar_pago')}
          </button>
        </div>
      </div>
    </div>
  )
}
