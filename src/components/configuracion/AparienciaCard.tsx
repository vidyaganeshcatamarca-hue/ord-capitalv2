import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import './AparienciaCard.css'

interface AparienciaCardProps {
  userId: string | undefined
}

export function AparienciaCard({ userId }: AparienciaCardProps) {
  const { showToast } = useToast()
  const [hide, setHide] = useState(false)

  useEffect(() => {
    if (!userId) return
    const raw = window.localStorage.getItem(`ocultar_montos:${userId}`)
    if (raw) setHide(raw === 'true')
  }, [userId])

  const toggle = async (next: boolean) => {
    setHide(next)
    if (userId) window.localStorage.setItem(`ocultar_montos:${userId}`, String(next))
    try {
      const { error } = await supabase.rpc('fn_actualizar_preferencia_usuario', { p_ocultar_montos: next })
      if (error) throw error
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

  return (
    <article className="config-hub-card" aria-labelledby="apariencia-title">
      <span className="config-hub-card-icon" aria-hidden="true">🎨</span>
      <div className="config-hub-card-content">
        <h3 id="apariencia-title">{t('config_apariencia')}</h3>
        <p>{t('config_apariencia_desc')}</p>
        <div className="apariencia-card">
          <div className="apariencia-row">
            <span>{t('config_theme')}</span>
            <select 
              style={{ background: 'var(--color-bg-dark)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '4px 8px' }}
              disabled
            >
              <option>{t('config_theme_dark')}</option>
            </select>
          </div>
          <div className="apariencia-row">
            <span>{t('config_language')}</span>
            <select 
              style={{ background: 'var(--color-bg-dark)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '4px 8px' }}
              disabled
            >
              <option>{t('config_language_spanish')}</option>
            </select>
          </div>
          <label className="apariencia-row">
            <span>{t('config_hide_amounts')}</span>
            <input type="checkbox" checked={hide} onChange={(event) => toggle(event.target.checked)} />
          </label>
        </div>
      </div>
    </article>
  )
}

export default AparienciaCard
