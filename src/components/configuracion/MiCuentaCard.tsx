import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { haptics } from '@/lib/haptics'
import './MiCuentaCard.css'

function getInitials(email?: string | null): string {
  if (!email) return 'U'
  return email.charAt(0).toUpperCase()
}

export function MiCuentaCard() {
  const { user, signOut } = useAuth()
  const { showToast } = useToast()
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    const meta = (user.user_metadata ?? {}) as { nombre?: string }
    setNombre(meta.nombre ?? '')
  }, [user])

  const handleSave = async () => {
    if (nombre.trim().length < 2) {
      showToast(t('field_required'), 'error')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('fn_actualizar_nombre_usuario', { p_nombre: nombre.trim() })
      if (error) throw error
      showToast(t('mi_cuenta_name_saved'), 'success')
      haptics.success()
    } catch (err) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

  return (
    <article className="config-hub-card mi-cuenta-card" aria-labelledby="mi-cuenta-title">
      <span className="config-hub-card-icon" aria-hidden="true">👤</span>
      <div className="config-hub-card-content">
        <h3 id="mi-cuenta-title">{t('config_mi_cuenta')}</h3>
        <p>{t('config_mi_cuenta_desc')}</p>
        <div className="mi-cuenta-row">
          <div className="mi-cuenta-avatar">{getInitials(user?.email)}</div>
          <div className="mi-cuenta-info">
            <h3>{user?.email ?? '—'}</h3>
            <p>{t('mi_cuenta_email_label')}</p>
          </div>
        </div>
        <div className="mi-cuenta-form">
          <label>
            <span>{t('mi_cuenta_name_label')}</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={50} />
          </label>
          <button type="button" className="mi-cuenta-button" disabled={saving} onClick={handleSave}>
            {t('mi_cuenta_name_save')}
          </button>
        </div>
        <button type="button" className="mi-cuenta-button ghost" onClick={handleSignOut}>
          {t('mi_cuenta_signout')}
        </button>
      </div>
    </article>
  )
}

export default MiCuentaCard
