import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/lib/format'
import { useFormatRevision } from '@/hooks/useFormatRevision'
import { parseError, t } from '@/locales/i18n'
import { normalizarPorcion, type Sobre, type SobrePorcion } from './types'
import './sobresModal.css'
import './SobreRescateModal.css'

interface SobreRendimientoModalProps {
  isOpen: boolean
  sobre: Sobre | null
  onClose: () => void
  onSuccess: () => void
}

/**
 * Registrar rendimiento (DF-21/DF-22/DF-23).
 *
 * Sólo aparecen las reservas REALES marcadas como generadoras de rendimientos
 * y con saldo vivo: un rendimiento va siempre a la reserva que lo generó.
 */
export function SobreRendimientoModal({ isOpen, sobre, onClose, onSuccess }: SobreRendimientoModalProps) {
  // El formato de moneda llega por contexto: sin esto queda el del primer render.
  useFormatRevision()
  const { showToast } = useToast()
  const [reservas, setReservas] = useState<SobrePorcion[]>([])
  const [billeteraId, setBilleteraId] = useState<number | null>(null)
  const [importe, setImporte] = useState('')
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !sobre) return
    let vivo = true
    setCargando(true)
    setError(null)
    setImporte('')
    ;(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('fn_sobre_porciones', {
          p_sobre_id: sobre.sobre_id,
        })
        if (rpcError) throw rpcError
        if (!vivo) return
        const elegibles = (Array.isArray(data) ? data : [])
          .map(normalizarPorcion)
          .filter((p) => p.modalidad === 'real' && p.genera_rendimiento && p.saldo > 0)
        setReservas(elegibles)
        setBilleteraId(elegibles[0]?.billetera_id ?? null)
      } catch (err) {
        if (vivo) setError(parseError(err))
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [isOpen, sobre])

  if (!isOpen || !sobre) return null

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const monto = Number(importe)
    if (!Number.isFinite(monto) || monto <= 0) {
      setError(t('error_sobre_amount_invalid'))
      return
    }
    if (!billeteraId) {
      setError(t('sobres_yield_no_reserve'))
      return
    }
    setGuardando(true)
    try {
      const { error: rpcError } = await supabase.rpc('fn_sobre_rendimiento_registrar', {
        p_sobre_id: sobre.sobre_id,
        p_billetera_id: billeteraId,
        p_importe: monto,
      })
      if (rpcError) throw rpcError
      showToast(t('sobres_yield_success'), 'success')
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
            <h2 className="font-display">{t('sobres_yield_title', { nombre: sobre.nombre })}</h2>
            <p className="sobre-modal-sub">{t('sobres_yield_hint')}</p>
          </div>
          <button type="button" className="sobre-modal-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        <div className="sobre-modal-body">
          {cargando && <p className="sobre-aviso">{t('loading')}</p>}

          {!cargando && reservas.length === 0 && (
            <p className="sobre-aviso">{t('sobres_yield_no_reserve')}</p>
          )}

          {reservas.length > 1 && (
            <div className="sobre-grupo">
              <label>{t('sobres_yield_reserve')}</label>
              <div className="sobre-reservas">
                {reservas.map((reserva) => (
                  <button
                    key={reserva.billetera_id}
                    type="button"
                    className={`sobre-modalidad ${billeteraId === reserva.billetera_id ? 'sobre-modalidad--activa' : ''}`}
                    onClick={() => setBilleteraId(reserva.billetera_id)}
                  >
                    {reserva.billetera_nombre} · {formatCurrency(reserva.saldo, reserva.moneda)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {reservas.length === 1 && (
            <div className="sobre-porcion">
              <div className="sobre-porcion-info">
                <strong>{reservas[0].billetera_nombre}</strong>
                <span className="sobre-porcion-modalidad sobre-porcion-modalidad--real">
                  {t('sobres_modality_real_short')}
                </span>
                <small>
                  {t('sobres_portion_available', {
                    monto: formatCurrency(reservas[0].saldo, reservas[0].moneda),
                  })}
                </small>
              </div>
            </div>
          )}

          <div className="sobre-grupo">
            <label htmlFor="rendimiento-importe">{t('sobres_yield_amount')}</label>
            <input
              id="rendimiento-importe"
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

          {error && <div className="sobre-error">{error}</div>}
        </div>

        <footer className="sobre-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>
            {t('btn_cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={guardando || cargando || reservas.length === 0}
          >
            {guardando ? <span className="sobre-spinner" /> : t('sobres_yield_register')}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default SobreRendimientoModal
