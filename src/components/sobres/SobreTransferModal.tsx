import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { formatCurrency } from '@/lib/format'
import { parseError, t } from '@/locales/i18n'
import type { BilleteraOperativa, Sobre, TransferMode } from './types'
import './SobreTransferModal.css'

interface SobreTransferModalProps {
  isOpen: boolean
  mode: TransferMode
  sobre: Sobre | null
  billeteras: BilleteraOperativa[]
  initialAmount?: number | null
  onClose: () => void
  onSuccess: () => void
}

export function SobreTransferModal({ isOpen, mode, sobre, billeteras, initialAmount, onClose, onSuccess }: SobreTransferModalProps) {
  const { showToast } = useToast()
  const [billeteraId, setBilleteraId] = useState<number | null>(null)
  const [monto, setMonto] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setBilleteraId(billeteras[0]?.billetera_id ?? null)
    setMonto(initialAmount ? String(initialAmount) : '')
  }, [isOpen, billeteras, initialAmount])

  if (!isOpen || !sobre) return null

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = Number(monto)
    if (!billeteraId || !Number.isFinite(amount) || amount <= 0) {
      showToast(t('field_required'), 'error')
      haptics.error()
      return
    }
    setSaving(true)
    try {
      const origen = mode === 'provision' ? billeteraId : sobre.fondo_id
      const destino = mode === 'provision' ? sobre.fondo_id : billeteraId
      const { error } = await supabase.rpc('fn_registrar_movimiento_caja', {
        p_tipo: 'transfer',
        p_billetera_origen_id: origen,
        p_billetera_destino_id: destino,
        p_valor_ingreso: 0,
        p_valor_egreso: amount,
        p_descripcion: mode === 'provision' ? 'savings_envelope_provision' : 'savings_envelope_rescue',
        p_detalle: mode === 'provision' ? 'savings_envelope_provision' : 'savings_envelope_rescue',
      })
      if (error) throw error
      showToast(t(mode === 'provision' ? 'sobres_provisioned' : 'sobres_rescued'), 'success')
      haptics.success()
      onSuccess()
      onClose()
    } catch (err) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sobre-modal-backdrop" role="presentation">
      <form className="sobre-modal" onSubmit={handleSubmit}>
        <header className="sobre-modal-header">
          <h2>{t(mode === 'provision' ? 'sobres_provision' : 'sobres_rescue')}</h2>
          <button type="button" onClick={onClose}>{t('btn_close')}</button>
        </header>
        <p className="sobre-transfer-note">{mode === 'provision' ? t('sobres_transfer_warning') : t('sobres_rescue_hint')}</p>
        <label>
          <span>{t(mode === 'provision' ? 'sobres_transfer_from' : 'sobres_transfer_to')}</span>
          <select value={billeteraId ?? ''} onChange={(event) => setBilleteraId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">{t('sobres_select_wallet')}</option>
            {billeteras.map((wallet) => (
              <option key={wallet.billetera_id} value={wallet.billetera_id}>{t(wallet.nombre)} - {formatCurrency(wallet.saldo_actual, wallet.moneda)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('sobres_transfer_amount')}</span>
          <input type="number" min="1" inputMode="decimal" value={monto} onChange={(event) => setMonto(event.target.value)} />
        </label>
        {billeteras.length === 0 && <p className="sobre-transfer-note">{t('sobres_no_wallets')}</p>}
        <footer className="sobre-modal-actions">
          <button type="button" onClick={onClose}>{t('btn_cancel')}</button>
          <button type="submit" disabled={saving || billeteras.length === 0}>{t(mode === 'provision' ? 'sobres_confirm_provision' : 'sobres_confirm_rescue')}</button>
        </footer>
      </form>
    </div>
  )
}

export default SobreTransferModal
