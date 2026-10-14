import { useState, useEffect } from 'react'
import { t } from '@/locales/i18n'
import {
  detectPwaBrowserEnv,
  isChromeOutdatedForWebapk,
  googleChromeSchemeUrl,
  type PwaBrowserEnv,
} from '@/utils/pwaEnv'

export const CHROME_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.android.chrome'

export function PWABanner() {
  const [isVisible, setIsVisible] = useState(false)
  const [browserEnv, setBrowserEnv] = useState<PwaBrowserEnv | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    // Si la app ya está ejecutándose como PWA instalada (standalone), no mostrar nada
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone
    if (isStandalone) {
      return
    }

    const env = detectPwaBrowserEnv(window.navigator.userAgent)
    setBrowserEnv(env)

    // Samsung Internet y Chrome desactualizado no usan prompt(): mostramos
    // la guía de instalación segura aunque beforeinstallprompt no llegue.
    // También respetamos el rechazo persistido del usuario.
    if (localStorage.getItem('pwa_prompt_rejected') === 'true') {
      return
    }
    if (env.kind === 'samsung-internet' || isChromeOutdatedForWebapk(env)) {
      setIsVisible(true)
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

  const isSamsung = browserEnv?.kind === 'samsung-internet'
  const isChromeOld = isChromeOutdatedForWebapk(browserEnv ?? { kind: 'ios' })

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

  // Variante Samsung: abrir la misma página dentro de Chrome.
  const handleOpenInChrome = () => {
    const schemeUrl = googleChromeSchemeUrl(window.location.href)
    if (!schemeUrl) {
      handleCopyLink()
      return
    }
    window.location.href = schemeUrl
  }

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(window.location.origin)
      .then(() => {
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2500)
      })
      .catch(() => { /* clipboard no disponible; el usuario copia a mano vía menú del navegador */ })
  }

  const handleReject = () => {
    // Rechazo explícito en nuestro propio cartel
    setIsVisible(false)
    setBrowserEnv(null)
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
            {isSamsung
              ? t('pwa_install_samsung_title')
              : isChromeOld
                ? t('pwa_install_chrome_outdated_title')
                : t('config_pwa_install_title')}
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary, #aaa)', lineHeight: 1.4 }}>
            {isSamsung
              ? t('pwa_install_samsung_desc')
              : isChromeOld
                ? t('pwa_install_chrome_outdated_desc')
                : t('config_pwa_install_desc')}
          </p>
          {isSamsung && (
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary, #888)', lineHeight: 1.4 }}>
              {t('pwa_install_samsung_fallback')}
            </p>
          )}
        </div>
      </div>
      {isSamsung ? (
        <>
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
              onClick={handleOpenInChrome}
              style={{
                flex: 2,
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: 'var(--accent, #e5ff00)',
                color: '#000',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {t('pwa_open_in_chrome')}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleCopyLink}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                border: '1px solid var(--border, #333)',
                background: 'transparent',
                color: 'var(--text-secondary, #aaa)',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {t('pwa_copy_link')}{linkCopied ? ` · ${t('pwa_link_copied')}` : ''}
            </button>
            <a
              href={CHROME_PLAY_STORE_URL}
              style={{
                flex: 2,
                padding: '10px',
                borderRadius: '10px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary, #aaa)',
                fontSize: '13px',
                cursor: 'pointer',
                textDecoration: 'underline',
                textAlign: 'center',
                alignSelf: 'center'
              }}
            >
              {t('pwa_install_chrome_hint')}
            </a>
          </div>
        </>
      ) : isChromeOld ? (
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
          <a
            href={CHROME_PLAY_STORE_URL}
            style={{
              flex: 2,
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--accent, #e5ff00)',
              color: '#000',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'center',
              alignSelf: 'center'
            }}
          >
            {t('pwa_update_chrome')}
          </a>
        </div>
      ) : (
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
      )}
    </div>
  )
}