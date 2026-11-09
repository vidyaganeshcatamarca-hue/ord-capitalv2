import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/lib/format'
import { parseError, t } from '@/locales/i18n'
import { normalizarPorcion, type AsignacionRescate, type ModalidadReserva, type Sobre, type SobrePorcion } from './types'
import './sobresModal.css'
import './SobreRescateModal.css'

interface SobreRescateModalProps {
  isOpen: boolean
  sobre: Sobre | null
  onClose: () => void
  onSuccess: () => void
}

interface LineaPorcion {
  porcion: SobrePorcion
  importe: string
}

/**
 * Rescate con reparto explícito (DF-04/DF-05). Cada importe vuelve a SU
 * billetera de origen: acá no se elige un destino distinto ni se reparte
 * automáticamente cuando una porción no alcanza.
 */
export function SobreRescateModal({ isOpen, sobre, onClose, onSuccess }: SobreRescateModalProps) {
  const { showToast } = useToast()
  const [lineas, setLineas] = useState<LineaPorcion[]>([])
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !sobre) return
    let vivo = true
    setCargando(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('fn_sobre_porciones', {
          p_sobre_id: sobre.sobre_id,
        })
        if (rpcError) throw rpcError
        if (!vivo) return
        const porciones = (Array.isArray(data) ? data : []).map(normalizarPorcion)
        setLineas(porciones.map((porcion) => ({ porcion, importe: '' })))
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

  const total = lineas.reduce((suma, linea) => {
    const n = Number(linea.importe)
    return suma + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)

  const algunaReal = lineas.some((l) => l.porcion.modalidad === 'real' && Number(l.importe) > 0)
  const excede = total > sobre.saldo + 0.005

  const cambiarImporte = (indice: number, valor: string) => {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, importe: valor } : l)))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const asignaciones: AsignacionRescate[] = []
    for (const linea of lineas) {
      const n = Number(linea.importe)
      if (linea.importe.trim() === '') continue
      if (!Number.isFinite(n) || n <= 0) {
        setError(t('error_sobre_amount_invalid'))
        return
      }
      if (n > linea.porcion.saldo + 0.005) {
        setError(
          t('error_sobre_portion_insufficient', {
            disponible: formatCurrency(linea.porcion.saldo, linea.porcion.moneda),
          }),
        )
        return
      }
      asignaciones.push({
        billetera_id: linea.porcion.billetera_id,
        modalidad: linea.porcion.modalidad as ModalidadReserva,
        importe: n,
      })
    }

    if (asignaciones.length === 0) {
      setError(t('error_sobre_rescue_empty'))
      return
    }

    setGuardando(true)
    try {
      const { error: rpcError } = await supabase.rpc('fn_sobre_rescatar', {
        p_sobre_id: sobre.sobre_id,
        p_asignaciones: asignaciones,
      })
      if (rpcError) throw rpcError
      showToast(t('sobres_rescue_success'), 'success')
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
            <h2 className="font-display">{t('sobres_rescue_title', { nombre: sobre.nombre })}</h2>
            <p className="sobre-modal-sub">{t('sobres_rescue_distribute')}</p>
          </div>
          <button type="button" className="sobre-modal-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        <div className="sobre-modal-body">
          {cargando && <p className="sobre-aviso">{t('loading')}</p>}

          {!cargando && lineas.length === 0 && <p className="sobre-aviso">{t('sobres_history_empty')}</p>}

          {lineas.map((linea, indice) => (
            <div className="sobre-porcion" key={`${linea.porcion.billetera_id}_${linea.porcion.modalidad}`}>
              <div className="sobre-porcion-info">
                <strong>{linea.porcion.billetera_nombre}</strong>
                <span className={`sobre-porcion-modalidad sobre-porcion-modalidad--${linea.porcion.modalidad}`}>
                  {t(
                    linea.porcion.modalidad === 'real'
                      ? 'sobres_modality_real_short'
                      : 'sobres_modality_virtual_short',
                  )}
                </span>
                <small>
                  {t('sobres_portion_available', {
                    monto: formatCurrency(linea.porcion.saldo, linea.porcion.moneda),
                  })}
                </small>
              </div>
              <div className="sobre-porcion-input">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={linea.importe}
                  onChange={(e) => cambiarImporte(indice, e.target.value)}
                />
                <button
                  type="button"
                  className="sobre-porcion-todo"
                  onClick={() => cambiarImporte(indice, String(linea.porcion.saldo))}
                >
                  {t('sobres_rescue')}
                </button>
              </div>
            </div>
          ))}

          {lineas.length > 0 && (
            <div className={`sobre-total ${excede ? 'sobre-total--excede' : ''}`}>
              <span>{t('sobres_rescue_total')}</span>
              <strong>{formatCurrency(total, sobre.moneda)}</strong>
            </div>
          )}

          {excede && <div className="sobre-error">{t('sobres_rescue_exceeds')}</div>}
          {algunaReal && <p className="sobre-aviso">{t('sobres_rescue_real_warning')}</p>}
          {error && <div className="sobre-error">{error}</div>}
        </div>

        <footer className="sobre-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>
            {t('btn_cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={guardando || cargando || lineas.length === 0 || total <= 0 || excede}
          >
            {guardando ? <span className="sobre-spinner" /> : t('sobres_confirm_rescue')}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default SobreRescateModal
