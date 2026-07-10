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
      await supabase.rpc('fn_actualizar_preferencia_usuario', { p_ocultar_montos: next })
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
            <span>Tema</span>
            <select 
              style={{ background: 'var(--color-bg-dark)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '4px 8px' }}
              disabled
            >
              <option>Oscuro Clido (Actual)</option>
            </select>
          </div>
          <div className="apariencia-row">
            <span>Idioma</span>
            <select 
              style={{ background: 'var(--color-bg-dark)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '4px 8px' }}
              disabled
            >
              <option>Espaol (Actual)</option>
              <option>English (Prximamente)</option>
            </select>
          </div>
        </div>
      </div>
    </article>
  )
}

export default AparienciaCard
