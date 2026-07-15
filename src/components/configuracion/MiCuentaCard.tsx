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
  const { user, signOut, nombreUsuario, setNombreUsuario } = useAuth()
  const { showToast } = useToast()
  const [nombre, setNombre] = useState('')
  const [originalNombre, setOriginalNombre] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setNombre(nombreUsuario)
    setOriginalNombre(nombreUsuario)
  }, [nombreUsuario])

  const handleSave = async () => {
    if (nombre.trim().length < 2) {
      showToast(t('field_required'), 'error')
      return
    }
    setSaving(true)
    try {
      const { error: rpcError } = await supabase.rpc('fn_actualizar_nombre_usuario', { p_nombre: nombre.trim() })
      if (rpcError) throw rpcError
      setNombreUsuario(nombre.trim())
      setOriginalNombre(nombre.trim())
      await supabase.auth.updateUser({ data: { nombre: nombre.trim() } })
        .catch(err => console.warn('Error al actualizar metadatos auth:', err))
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

  const isNameChanged = nombre.trim() !== originalNombre.trim()

  return (
    <article className="config-hub-card mi-cuenta-card" aria-labelledby="mi-cuenta-title">
      {/* ── Cabecera (siempre visible, clickeable) ── */}
      <button
        type="button"
        className="mi-cuenta-header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="mi-cuenta-body"
      >
        <span className="config-hub-card-icon" aria-hidden="true">👤</span>
        <div className="config-hub-card-content">
          <h3 id="mi-cuenta-title">{t('config_mi_cuenta')}</h3>
          <p>{user?.email}</p>
        </div>
        <span className={`mi-cuenta-chevron ${open ? 'mi-cuenta-chevron--open' : ''}`} aria-hidden="true">›</span>
      </button>

      {/* ── Cuerpo (plegable) ── */}
      {open && (
        <div id="mi-cuenta-body" className="mi-cuenta-body">
          <div className="mi-cuenta-form">
            <label htmlFor="mi-cuenta-nombre">
              <span>{t('mi_cuenta_name_label')}</span>
              <input
                id="mi-cuenta-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={50}
                placeholder={t('mi_cuenta_name_label')}
              />
            </label>
            {isNameChanged && (
              <button type="button" className="mi-cuenta-button" disabled={saving} onClick={handleSave}>
                {saving ? '…' : t('mi_cuenta_name_save')}
              </button>
            )}
          </div>

          <button type="button" className="mi-cuenta-button ghost" onClick={handleSignOut}>
            {t('mi_cuenta_signout')}
          </button>
        </div>
      )}
    </article>
  )
}

export default MiCuentaCard
