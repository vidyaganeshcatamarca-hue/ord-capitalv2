import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import './AportarProyectoModal.css'

interface Billetera {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
  es_fondo_prevision: boolean
}

interface AportarProyectoModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  proyectoId: number
  proyectoNombre: string
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

export function AportarProyectoModal({
  isOpen,
  onClose,
  onSuccess,
  proyectoId,
  proyectoNombre,
}: AportarProyectoModalProps) {
  const { showToast } = useToast()
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [billeteraOrigenId, setBilleteraOrigenId] = useState<number | null>(null)
  const [billeteras, setBilleteras] = useState<Billetera[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingBilleteras, setLoadingBilleteras] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargarBilleteras = useCallback(async () => {
    setLoadingBilleteras(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('fn_obtener_billeteras_activas')
      if (rpcError) throw rpcError
      setBilleteras(
        ((data ?? []) as any[])
          .filter((b) => !b.es_fondo_prevision)
          .map((b) => ({
            billetera_id: Number(b.billetera_id),
            nombre: b.nombre ?? '',
            moneda: b.moneda ?? 'ARS',
            saldo_actual: Number(b.saldo_actual ?? 0),
            es_fondo_prevision: Boolean(b.es_fondo_prevision),
          })),
      )
    } catch (err: any) {
      showToast(parseError(err), 'error')
    } finally {
      setLoadingBilleteras(false)
    }
  }, [showToast])

  useEffect(() => {
    if (isOpen) {
      setMonto('')
      setNota('')
      setBilleteraOrigenId(null)
      setError(null)
      cargarBilleteras()
    }
  }, [isOpen, cargarBilleteras])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const montoNum = Number(monto)
    if (!monto || isNaN(montoNum) || montoNum <= 0) {
      setError(t('familia_saldar_monto_invalido'))
      return
    }
    if (!billeteraOrigenId) {
      setError(t('familia_saldar_origen_requerido'))
      return
    }

    setLoading(true)
    try {
      const params: Record<string, any> = {
        p_tipo: 'expense',
        p_billetera_origen_id: billeteraOrigenId,
        p_valor_egreso: montoNum,
        p_descripcion: t('proyecto_aportar_descripcion', { nombre: proyectoNombre }),
        p_es_compartido: true,
        p_proyecto_id: proyectoId,
      }
      if (nota.trim()) params.p_detalle = nota.trim()

      const { error: rpcError } = await supabase.rpc('fn_registrar_movimiento_caja', params)
      if (rpcError) throw rpcError

      showToast(t('proyecto_aportar_success', { monto: formatMoney(montoNum) }), 'success')
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
    <div className="aportar-overlay" onClick={onClose}>
      <form className="aportar-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="aportar-header">
          <div>
            <h2 className="font-display">{t('proyecto_aportar_titulo')}</h2>
            <p className="aportar-sub">
              {t('proyecto_aportar_label')} <strong>{proyectoNombre}</strong>
            </p>
          </div>
          <button type="button" className="aportar-close" onClick={onClose} aria-label={t('btn_close')}>
            ×
          </button>
        </header>

        <div className="aportar-body">
          <div className="aportar-group">
            <label>{t('hogar_saldar_monto')}</label>
            <input
              type="number"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
              step="0.01"
              min="0"
              autoFocus
            />
          </div>

          <div className="aportar-group">
            <label>{t('hogar_saldar_origen', { nombre: t('familia_integrante_generico') })}</label>
            <select
              value={billeteraOrigenId ?? ''}
              onChange={(e) => setBilleteraOrigenId(e.target.value ? Number(e.target.value) : null)}
              disabled={loadingBilleteras}
            >
              <option value="">--</option>
              {billeteras.map((b) => (
                <option key={b.billetera_id} value={b.billetera_id}>
                  {t(b.nombre)} ({b.moneda}) — {formatMoney(b.saldo_actual)}
                </option>
              ))}
            </select>
          </div>

          <div className="aportar-group">
            <label>{t('hogar_saldar_nota')}</label>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="..."
            />
          </div>

          {error && <div className="aportar-error">{error}</div>}
        </div>

        <footer className="aportar-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            {t('hogar_saldar_cancelar')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <span className="aportar-spinner" /> : t('hogar_saldar_confirmar')}
          </button>
        </footer>
      </form>
    </div>
  )
}
