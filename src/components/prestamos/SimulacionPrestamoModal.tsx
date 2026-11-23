import { t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { motivoKey, numero, type PlanFila, type SimulacionPrestamo } from './types'
import { montoONoCalculable } from './formato'
import './prestamos.css'

interface SimulacionPrestamoModalProps {
  fila: PlanFila
  resultado: SimulacionPrestamo
  onClose: () => void
  /** Moves to the single payment path (the loan itself), never pays from here. */
  onRegistrar: () => void
}

/**
 * Honest simulation (S18). The current balance, the proposed amount and the
 * projected balance are always shown. Months and saved interest only appear when
 * the backend could compute them: a `null` is rendered as "cannot be calculated
 * with the available information", with the motive, and never as 0.
 */
export function SimulacionPrestamoModal({
  fila,
  resultado,
  onClose,
  onRegistrar,
}: SimulacionPrestamoModalProps) {
  useFormatRevision()

  const moneda = resultado.moneda ?? fila.moneda
  const mesesRestantes = numero(resultado.meses_restantes)
  const mesesAhorrados = numero(resultado.meses_ahorrados)
  const interesesAhorrados = numero(resultado.intereses_ahorrados)
  const claveMotivo = motivoKey(resultado.motivo)

  const noCalculable = (
    <span className="prestamos-no-calculable">{t('prestamos_saneamiento_no_calculable')}</span>
  )

  return (
    <div className="prestamos-overlay" onClick={onClose}>
      <div className="prestamos-modal" onClick={(e) => e.stopPropagation()}>
        <header className="prestamos-modal-header">
          <div>
            <h2 className="font-display">{t('prestamos_saneamiento_simular_titulo')}</h2>
            <p className="prestamos-modal-sub">{fila.nombre}</p>
          </div>
          <button type="button" className="prestamos-modal-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        <div className="prestamos-modal-body">
          <div className="prestamos-sim-row">
            <span>{t('prestamos_saneamiento_simular_saldo')}</span>
            <strong>{montoONoCalculable(numero(resultado.saldo_pendiente), moneda)}</strong>
          </div>
          <div className="prestamos-sim-row">
            <span>{t('prestamos_saneamiento_simular_monto')}</span>
            <strong>{montoONoCalculable(numero(resultado.monto_propuesto), moneda)}</strong>
          </div>
          <div className="prestamos-sim-row is-destacado">
            <span>{t('prestamos_saneamiento_simular_proyectado')}</span>
            <strong>{montoONoCalculable(numero(resultado.saldo_proyectado), moneda)}</strong>
          </div>
          <div className="prestamos-sim-row">
            <span>{t('prestamos_saneamiento_simular_meses')}</span>
            <strong>{mesesRestantes === null ? noCalculable : mesesRestantes}</strong>
          </div>
          <div className="prestamos-sim-row">
            <span>{t('prestamos_saneamiento_simular_meses_ahorrados')}</span>
            <strong>{mesesAhorrados === null ? noCalculable : mesesAhorrados}</strong>
          </div>
          <div className="prestamos-sim-row">
            <span>{t('prestamos_saneamiento_simular_intereses')}</span>
            <strong>
              {interesesAhorrados === null ? noCalculable : montoONoCalculable(interesesAhorrados, moneda)}
            </strong>
          </div>

          {claveMotivo && <p className="prestamos-nota">{t(claveMotivo)}</p>}
          <p className="prestamos-nota">{t('prestamos_saneamiento_simular_aviso')}</p>
        </div>

        <footer className="prestamos-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('btn_close')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              haptics.light()
              onRegistrar()
            }}
          >
            {t('prestamos_lista_registrar_pago')}
          </button>
        </footer>
      </div>
    </div>
  )
}
