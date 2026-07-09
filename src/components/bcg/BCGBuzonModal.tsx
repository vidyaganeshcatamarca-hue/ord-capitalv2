import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import { formatMoneyARS } from '@/lib/bcgUtils'
import './BCGBuzonModal.css'

interface Billetera {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
  es_fondo_prevision: boolean
}

interface BCGBuzonModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  buzonId: number
  buzonNombre: string
  monto: number
}

export function BCGBuzonModal({ isOpen, onClose, onSuccess, buzonId, buzonNombre, monto }: BCGBuzonModalProps) {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [billeteras, setBilleteras] = useState<Billetera[]>([])
  const [origenId, setOrigenId] = useState<number | null>(null)
  const [nota, setNota] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingBilleteras, setLoadingBilleteras] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      cargar()
      setOrigenId(null)
      setNota('')
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const cargar = async () => {
    setLoadingBilleteras(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('fn_obtener_billeteras_activas')
      if (rpcError) throw rpcError
      setBilleteras(
        ((data ?? []) as any[])
          .filter((b: any) => !b.es_fondo_prevision)
          .map((b: any) => ({
            billetera_id: Number(b.billetera_id),
            nombre: b.nombre ?? '',
            moneda: b.moneda ?? 'ARS',
            saldo_actual: Number(b.saldo_actual ?? 0),
            es_fondo_prevision: Boolean(b.es_fondo_prevision),
          }))
      )
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoadingBilleteras(false)
    }
  }

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!origenId) {
      setError(t('bcg_hormiga_estado_no_buzon_titulo') + ' (sin origen)')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { error: rpcError } = await supabase.rpc('fn_registrar_movimiento_caja', {
        p_tipo: 'transfer',
        p_billetera_origen_id: origenId,
        p_billetera_destino_id: buzonId,
        p_valor_ingreso: monto,
        p_valor_egreso: 0,
        p_descripcion: t('bcg_buzon_modal_titulo'),
        p_detalle: nota.trim() || null,
      })
      if (rpcError) throw rpcError
      showToast(t('bcg_buzon_modal_exito'), 'success')
      haptics.success()
      window.dispatchEvent(new CustomEvent('movement-added'))
      onSuccess?.()
      onClose()
    } catch (err: any) {
      setError(parseError(err))
      haptics.error()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bcg-buzon-overlay" onClick={onClose}>
      <form className="bcg-buzon-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="bcg-buzon-header">
          <h2 className="font-display">🐜 {t('bcg_buzon_modal_titulo')}</h2>
          <button type="button" className="bcg-buzon-close" onClick={onClose} aria-label={t('btn_close')}>×</button>
        </header>

        <div className="bcg-buzon-body">
          <div className="bcg-buzon-info">
            <span>{t('bcg_hormiga_estado_transfer_titulo', { monto: '' })}</span>
            <strong>{formatMoneyARS(monto)}</strong>
            <small>→ {buzonNombre}</small>
          </div>

          <div className="bcg-buzon-group">
            <label>{t('bcg_buzon_modal_origen_label')}</label>
            <select
              value={origenId ?? ''}
              onChange={(e) => setOrigenId(e.target.value ? Number(e.target.value) : null)}
              disabled={loadingBilleteras}
            >
              <option value="">--</option>
              {billeteras.map((b) => (
                <option key={b.billetera_id} value={b.billetera_id}>
                  {b.nombre} ({b.moneda}) — {formatMoneyARS(b.saldo_actual)}
                </option>
              ))}
            </select>
          </div>

          <div className="bcg-buzon-group">
            <label>{t('bcg_buzon_modal_monto_label')}</label>
            <input type="number" value={monto} readOnly />
          </div>

          <div className="bcg-buzon-group">
            <label>{t('bcg_buzon_modal_nota_label')}</label>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="..."
            />
          </div>

          {error && <div className="bcg-buzon-error">{error}</div>}
        </div>

        <footer className="bcg-buzon-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            {t('bcg_buzon_modal_cancelar')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading || !origenId}>
            {loading ? <span className="bcg-buzon-spinner" /> : t('bcg_buzon_modal_confirmar')}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default BCGBuzonModal
