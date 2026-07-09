import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import type { Sobre } from './types'
import './SobreFormModal.css'

interface SobreFormModalProps {
  isOpen: boolean
  sobre: Sobre | null
  onClose: () => void
  onSuccess: () => void
}

function defaultTargetDate() {
  const date = new Date()
  date.setMonth(date.getMonth() + 6)
  return date.toISOString().slice(0, 10)
}

export function SobreFormModal({ isOpen, sobre, onClose, onSuccess }: SobreFormModalProps) {
  const { showToast } = useToast()
  const [nombre, setNombre] = useState('')
  const [montoMeta, setMontoMeta] = useState('')
  const [fechaObjetivo, setFechaObjetivo] = useState(() => defaultTargetDate())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setNombre(sobre?.nombre ?? '')
    setMontoMeta(sobre ? String(sobre.monto_meta) : '')
    setFechaObjetivo(defaultTargetDate())
  }, [isOpen, sobre])

  if (!isOpen) return null

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = Number(montoMeta)
    if (!nombre.trim() || !Number.isFinite(amount) || amount <= 0 || !fechaObjetivo) {
      showToast(t('field_required'), 'error')
      haptics.error()
      return
    }
    setSaving(true)
    try {
      if (sobre) {
        const { error } = await supabase.rpc('fn_editar_fondo_prevision', {
          p_billetera_id: sobre.fondo_id,
          p_nombre: nombre.trim(),
          p_monto_meta: amount,
          p_fecha_objetivo: fechaObjetivo,
          p_icono: 'S',
        })
        if (error) throw error
        showToast(t('sobres_updated'), 'success')
      } else {
        const { error } = await supabase.rpc('fn_crear_fondo_prevision', {
          p_nombre: nombre.trim(),
          p_monto_meta: amount,
          p_fecha_objetivo: fechaObjetivo,
        })
        if (error) throw error
        showToast(t('sobres_created'), 'success')
      }
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
          <h2>{t(sobre ? 'sobres_edit_title' : 'sobres_create_title')}</h2>
          <button type="button" onClick={onClose}>{t('btn_close')}</button>
        </header>
        <label>
          <span>{t('sobres_name')}</span>
          <input value={nombre} onChange={(event) => setNombre(event.target.value)} />
        </label>
        <label>
          <span>{t('sobres_target_amount')}</span>
          <input type="number" min="1" inputMode="decimal" value={montoMeta} onChange={(event) => setMontoMeta(event.target.value)} />
        </label>
        <label>
          <span>{t('sobres_target_date')}</span>
          <input type="date" value={fechaObjetivo} onChange={(event) => setFechaObjetivo(event.target.value)} />
        </label>
        <footer className="sobre-modal-actions">
          <button type="button" onClick={onClose}>{t('btn_cancel')}</button>
          <button type="submit" disabled={saving}>{t('sobres_save')}</button>
        </footer>
      </form>
    </div>
  )
}

export default SobreFormModal
