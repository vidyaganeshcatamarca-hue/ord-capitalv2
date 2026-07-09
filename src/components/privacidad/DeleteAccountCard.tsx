import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { haptics } from '@/lib/haptics'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/contexts/AuthContext'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { parseError, t } from '@/locales/i18n'
import './DeleteAccountCard.css'

const CONFIRMATION_TEXT = 'ELIMINAR'

export function DeleteAccountCard() {
  const { showToast } = useToast()
  const { signOut } = useAuth()
  const [confirmText, setConfirmText] = useState('')
  const [saving, setSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)

  const canSubmit = confirmText === CONFIRMATION_TEXT && !saving && !scheduledAt

  const handleSubmit = async () => {
    setShowConfirm(false)
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('fn_eliminar_cuenta_usuario', {
        p_confirmacion_texto: CONFIRMATION_TEXT,
      })
      if (error) throw error
      const fecha = data ? new Date(String(data)).toLocaleDateString() : ''
      setScheduledAt(fecha)
      showToast(t('privacidad_delete_success', { fecha }), 'success')
      haptics.success()
      try {
        await signOut()
      } catch {
        // Si signOut falla por la sesion ya invalidada, el usuario igual ve el estado.
      }
    } catch (err) {
      const msg = String(parseError(err))
      if (msg.includes('error_account_already_scheduled')) {
        setScheduledAt(t('privacidad_delete_scheduled', { fecha: '—' }))
      } else {
        showToast(msg, 'error')
        haptics.error()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="privacidad-delete" aria-labelledby="privacidad-delete-title">
      <h2 id="privacidad-delete-title">{t('privacidad_section_delete')}</h2>
      <p>{t('privacidad_delete_help')}</p>
      {scheduledAt ? (
        <p className="privacidad-delete-scheduled">{scheduledAt}</p>
      ) : (
        <>
          <input
            className="privacidad-delete-input"
            type="text"
            placeholder={t('privacidad_delete_placeholder')}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="privacidad-delete-button"
            disabled={!canSubmit}
            onClick={() => setShowConfirm(true)}
          >
            {t('privacidad_delete_button')}
          </button>
        </>
      )}
      <ConfirmModal
        isOpen={showConfirm}
        type="danger"
        title={t('privacidad_delete_confirm_title')}
        message={t('privacidad_delete_confirm_body')}
        confirmText={t('privacidad_delete_button')}
        cancelText={t('btn_cancel')}
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirm(false)}
      />
    </section>
  )
}

export default DeleteAccountCard
