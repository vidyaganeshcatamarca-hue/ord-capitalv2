import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { formatCurrency } from '@/lib/format'
import type { DeudaItem } from '@/pages/Saneamiento/SaneamientoPage'

interface ConfirmarPagoModalProps {
  deuda: DeudaItem
  monto: number
  isOpen: boolean
  onClose: () => void
  onConfirmar: (billeteraOrigenId: number, fecha: string, nota: string) => void
}

interface BilleteraOption {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
}

export function ConfirmarPagoModal({ deuda, monto, isOpen, onClose, onConfirmar }: ConfirmarPagoModalProps) {
  const { showToast } = useToast()

  const [billeteras, setBilleteras] = useState<BilleteraOption[]>([])
  const [billeteraId, setBilleteraId] = useState<string>('')
  const [fecha, setFecha] = useState<string>(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })
  const [nota, setNota] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    const load = async () => {
      setLoading(true)
      try {
        const res = await rpc<BilleteraOption[]>('fn_obtener_billeteras_activas')
        const filtradas = (res || []).filter((b) => b.moneda === 'ARS')
        setBilleteras(filtradas)
        if (filtradas.length > 0) setBilleteraId(String(filtradas[0].billetera_id))
      } catch (err: any) {
        showToast(parseError(err), 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isOpen, showToast])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!billeteraId) {
      showToast(t('saneamiento_error_billetera_requerida'), 'error')
      return
    }
    onConfirmar(Number(billeteraId), fecha, nota)
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('saneamiento_pago_titulo')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="saneamiento-form">
          <div className="saneamiento-sim-row" style={{ marginBottom: '16px' }}>
            <span>{deuda.nombre_deuda}</span>
            <strong>{formatCurrency(monto, 'ARS')}</strong>
          </div>

          <div className="form-group">
            <label>{t('saneamiento_billetera_origen')}</label>
            {loading ? (
              <div className="spinner-sm" />
            ) : billeteras.length === 0 ? (
              <p className="text-muted">{t('saneamiento_error_sin_billeteras_ars')}</p>
            ) : (
              <select value={billeteraId} onChange={(e) => setBilleteraId(e.target.value)} required>
                {billeteras.map((b) => (
                  <option key={b.billetera_id} value={b.billetera_id}>
                    {t(b.nombre)} — {formatCurrency(b.saldo_actual, b.moneda)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <label>{t('saneamiento_fecha_pago')}</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>

          <div className="form-group">
            <label>{t('saneamiento_nota_opcional')}</label>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={t('saneamiento_pago_nota_placeholder')}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('saneamiento_cancelar')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={billeteras.length === 0}>
              {t('saneamiento_confirmar_pago')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
