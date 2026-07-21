import { useState, useEffect } from 'react'
import { t } from '@/locales/i18n'

export function PWABanner() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Si la app ya está ejecutándose como PWA instalada (standalone), no mostrar nada
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone
    if (isStandalone) {
      return
    }

    // Si el usuario ya la rechazó explícitamente en el pasado, no mostrar cartel automático
    if (localStorage.getItem('pwa_prompt_rejected') === 'true') {
      return
    }

    // Puede que el evento ya esté guardado en window desde index.html
    if (window.deferredPrompt) {
      setIsVisible(true)
    }

    const handler = (e: any) => {
      // Prevenir el infobar nativo del navegador para control propio
      e.preventDefault()
      window.deferredPrompt = e
      setIsVisible(true)
    }

    const handleAppInstalled = () => {
      setIsVisible(false)
      window.deferredPrompt = null
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  if (!isVisible) return null

  const handleInstall = async () => {
    const promptEvent = window.deferredPrompt
    if (!promptEvent) return

    try {
      promptEvent.prompt()
      const choiceResult = await promptEvent.userChoice
      
      if (choiceResult && choiceResult.outcome === 'accepted') {
// setIsVisible(false) // keep banner visible on error
        window.deferredPrompt = null
        localStorage.removeItem('pwa_prompt_rejected')
      } else {
        // Keep banner visible to allow user to try again later
        // Do not set rejected flag here, as the user did not explicitly reject
      }
    } catch (err) {
      console.error('Error al solicitar instalación de PWA:', err)
      setIsVisible(false)
    }
  }

  const handleReject = () => {
    // Rechazo explícito en nuestro propio cartel
    setIsVisible(false)
    localStorage.setItem('pwa_prompt_rejected', 'true')
  }

  return (
    <div style={{
      position: 'fixed',
      top: 'env(safe-area-inset-top, 16px)',
      left: '16px',
      right: '16px',
      backgroundColor: 'var(--card-bg, #1e1e1e)',
      padding: '16px',
      borderRadius: '16px',
      border: '1px solid var(--border, #333)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      animation: 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-150%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: 'var(--accent, #e5ff00)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          flexShrink: 0
        }}>
          📱
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
            {t('config_pwa_install_title')}
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary, #aaa)', lineHeight: 1.4 }}>
            {t('config_pwa_install_desc')}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button 
          onClick={handleReject}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid var(--border, #333)',
            background: 'var(--bg-secondary, #2a2a2a)',
            color: 'var(--text-primary, #fff)',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          {t('btn_cancel')}
        </button>
        <button 
          onClick={handleInstall}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--accent, #e5ff00)',
            color: '#000',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {t('btn_install')}
        </button>
      </div>
    </div>
  )
}
