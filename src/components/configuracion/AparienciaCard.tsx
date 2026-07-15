import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/contexts/ToastContext'
import { parseError, t } from '@/locales/i18n'
import { ToggleSwitch } from './ToggleSwitch'
import './AparienciaCard.css'

interface AparienciaCardProps {
  userId: string | undefined
}

type AppTheme = 'dark' | 'warm-light'

const THEME_KEY = 'app_theme'

function applyTheme(theme: AppTheme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(THEME_KEY, theme)
}

export function AparienciaCard({ userId }: AparienciaCardProps) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [hide, setHide] = useState(false)
  const [theme, setTheme] = useState<AppTheme>('dark')
  // Misterio: ON = visible, OFF = hidden
  const [misterioVisible, setMisterioVisible] = useState(true)

  useEffect(() => {
    if (!userId) return
    // Ocultar montos (persistente)
    const rawHide = window.localStorage.getItem(`ocultar_montos:${userId}`)
    if (rawHide) setHide(rawHide === 'true')
    // Tema
    const savedTheme = (window.localStorage.getItem(THEME_KEY) as AppTheme) || 'dark'
    setTheme(savedTheme)
    applyTheme(savedTheme)
    // Misterio
    const oculto = window.localStorage.getItem('ocultar_fugas_misterio') === 'true'
    setMisterioVisible(!oculto)
  }, [userId])

  const toggleHide = async (next: boolean) => {
    setHide(next)
    if (userId) window.localStorage.setItem(`ocultar_montos:${userId}`, String(next))
    try {
      const { error } = await supabase.rpc('fn_actualizar_preferencia_usuario', { p_ocultar_montos: next })
      if (error) throw error
    } catch (err) {
      showToast(parseError(err), 'error')
    }
  }

  const changeTheme = (nextTheme: AppTheme) => {
    setTheme(nextTheme)
    applyTheme(nextTheme)
  }

  const toggleMisterio = (visible: boolean) => {
    setMisterioVisible(visible)
    if (visible) {
      localStorage.removeItem('ocultar_fugas_misterio')
    } else {
      localStorage.setItem('ocultar_fugas_misterio', 'true')
    }
    window.dispatchEvent(new Event('fugas-config-changed'))
  }

  return (
    <article className="config-hub-card apariencia-card-wrap" aria-labelledby="apariencia-title">
      {/* ── Cabecera (acordeón) ── */}
      <button
        type="button"
        className="apariencia-header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="apariencia-body"
      >
        <span className="config-hub-card-icon" aria-hidden="true">🎨</span>
        <div className="config-hub-card-content">
          <h3 id="apariencia-title">{t('config_apariencia')}</h3>
          <p>{t('config_theme_desc')}</p>
        </div>
        <span className={`apariencia-chevron ${open ? 'apariencia-chevron--open' : ''}`} aria-hidden="true">›</span>
      </button>

      {/* ── Cuerpo plegable ── */}
      {open && (
        <div id="apariencia-body" className="apariencia-body">
          {/* Selector de tema */}
          <div className="apariencia-row">
            <span>{t('config_theme')}</span>
            <div className="apariencia-theme-pills">
              <button
                type="button"
                className={`apariencia-theme-pill ${theme === 'dark' ? 'apariencia-theme-pill--active' : ''}`}
                onClick={() => changeTheme('dark')}
              >
                🌑 {t('config_theme_dark')}
              </button>
              <button
                type="button"
                className={`apariencia-theme-pill ${theme === 'warm-light' ? 'apariencia-theme-pill--active' : ''}`}
                onClick={() => changeTheme('warm-light')}
              >
                ☀️ {t('config_theme_warm_light')}
              </button>
            </div>
          </div>

          {/* Ocultar montos (persistente) */}
          <div className="apariencia-row">
            <div className="apariencia-row-label">
              <span>{t('config_hide_amounts')}</span>
              <p className="apariencia-row-desc">{t('config_apariencia_ocultar_montos_desc')}</p>
            </div>
            <ToggleSwitch checked={hide} onChange={toggleHide} />
          </div>

          {/* Mostrar/ocultar Misterio en Home */}
          <div className="apariencia-row">
            <div className="apariencia-row-label">
              <span>{t('config_mostrar_misterio')}</span>
              <p className="apariencia-row-desc">{t('config_mostrar_misterio_desc')}</p>
            </div>
            <ToggleSwitch checked={misterioVisible} onChange={toggleMisterio} />
          </div>
        </div>
      )}
    </article>
  )
}

export default AparienciaCard
