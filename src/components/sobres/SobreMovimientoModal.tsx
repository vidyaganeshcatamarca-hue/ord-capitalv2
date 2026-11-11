import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency, formatDate } from '@/lib/format'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { parseError, t } from '@/locales/i18n'
import { WalletDropdownSelect, type WalletOptionItem } from '@/components/WalletDropdownSelect'
import type { BilleteraOperativa, ModalidadReserva, SobreMovimiento } from './types'
import './sobresModal.css'

interface SobreMovimientoModalProps {
  isOpen: boolean
  movimiento: SobreMovimiento | null
  moneda: string
  billeteras: BilleteraOperativa[]
  onClose: () => void
  onSuccess: () => void
}

/**
 * Corrige un aporte o un rescate ya registrado. La RPC edita el movimiento
 * original y su misma pata de caja: no crea un movimiento nuevo.
 */
export function SobreMovimientoModal({
  isOpen,
  movimiento,
  moneda,
  billeteras,
  onClose,
  onSuccess,
}: SobreMovimientoModalProps) {
  // El formato de moneda llega por contexto: sin esto queda el del primer render.
  useFormatRevision()
  const { showToast } = useToast()
  const [importe, setImporte] = useState('')
  const [billeteraId, setBilleteraId] = useState<number | null>(null)
  const [modalidad, setModalidad] = useState<ModalidadReserva>('virtual')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Un sobre no convierte: sólo billeteras de su moneda (DF-07).
  const disponibles = useMemo(
    () => billeteras.filter((b) => b.moneda?.toUpperCase() === moneda.toUpperCase()),
    [billeteras, moneda],
  )

  const wallets: WalletOptionItem[] = useMemo(
    () =>
      disponibles.map((b) => ({
        billetera_id: b.billetera_id,
        nombre: b.nombre,
        moneda: b.moneda,
        saldo_actual: b.saldo_actual,
        icono: b.icono ?? null,
        es_fondo_prevision: b.es_fondo_prevision,
      })),
    [disponibles],
  )

  useEffect(() => {
    if (!isOpen || !movimiento) return
    setImporte(String(movimiento.importe))
    setBilleteraId(movimiento.billetera_id)
    setModalidad(movimiento.modalidad)
    setError(null)
    setGuardando(false)
  }, [isOpen, movimiento])

  if (!isOpen || !movimiento) return null

  const importeNum = Number(importe)
  const importeValido = Number.isFinite(importeNum) && importeNum > 0

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!importeValido) {
      setError(t('error_sobre_amount_invalid'))
      return
    }
    if (!billeteraId) {
      setError(t('error_sobre_wallet_not_found'))
      return
    }
    setGuardando(true)
    try {
      const { error: rpcError } = await supabase.rpc('fn_sobre_editar_movimiento', {
        p_movimiento_id: movimiento.movimiento_id,
        p_importe: importeNum,
        p_billetera_id: billeteraId,
        p_modalidad: modalidad,
      })
      if (rpcError) throw rpcError
      showToast(t('sobres_correct_success'), 'success')
      haptics.success()
      onSuccess()
      onClose()
    } catch (err) {
      setError(parseError(err))
      haptics.error()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="sobre-overlay" onClick={onClose}>
      <form className="sobre-modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="sobre-modal-header">
          <div>
            <h2 className="font-display">{t('sobres_correct_title')}</h2>
            <p className="sobre-modal-sub">
              {formatDate(movimiento.fecha)} · {movimiento.billetera_nombre}
            </p>
          </div>
          <button type="button" className="sobre-modal-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        <div className="sobre-modal-body">
          <div className="sobre-grupo">
            <label htmlFor="corregir-importe">{t('sobres_amount')}</label>
            <input
              id="corregir-importe"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>

          <div className="sobre-grupo">
            <label>{movimiento.tipo === 'rescate' ? t('sobres_wallet_destination') : t('sobres_wallet_origin')}</label>
            {disponibles.length === 0 ? (
              <p className="sobre-aviso">{t('sobres_no_wallets_currency', { moneda })}</p>
            ) : (
              <WalletDropdownSelect
                wallets={wallets}
                selectedWalletId={billeteraId}
                onSelectWallet={setBilleteraId}
                placeholder={t('sobres_wallet_origin')}
                formatMonto={(val, cur) => formatCurrency(val, cur)}
              />
            )}
          </div>

          <div className="sobre-grupo">
            <label>{t('sobres_modality')}</label>
            <div className="sobre-modalidades">
              <button
                type="button"
                className={`sobre-modalidad ${modalidad === 'virtual' ? 'sobre-modalidad--activa' : ''}`}
                onClick={() => setModalidad('virtual')}
              >
                {t('sobres_modality_virtual')}
              </button>
              <button
                type="button"
                className={`sobre-modalidad ${modalidad === 'real' ? 'sobre-modalidad--activa' : ''}`}
                onClick={() => setModalidad('real')}
              >
                {t('sobres_modality_real')}
              </button>
            </div>
          </div>

          <p className="sobre-aviso">{t('sobres_correct_hint')}</p>

          {error && <div className="sobre-error">{error}</div>}
        </div>

        <footer className="sobre-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>
            {t('btn_cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={guardando || disponibles.length === 0}>
            {guardando ? <span className="sobre-spinner" /> : t('btn_save_changes')}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default SobreMovimientoModal
