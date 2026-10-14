import { useState, useEffect } from 'react'
import { t } from '@/locales/i18n'
import { useToast } from '@/contexts/ToastContext'
import {
  detectPwaBrowserEnv,
  isChromeOutdatedForWebapk,
  googleChromeSchemeUrl,
} from '@/utils/pwaEnv'
import { CHROME_PLAY_STORE_URL } from '@/components/PWABanner'

// Almacenamos el evento globalmente en window
declare global {
  interface Window {
    deferredPrompt?: any;
  }
}

export function PWACard() {
  const [canInstall, setCanInstall] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    // Si ya existe el evento guardado, habilitar botón
    if (window.deferredPrompt) {
      setCanInstall(true)
    }

    const handleBeforeInstallPrompt = (e: any) => {
      // Prevenir el mini-infobar en móviles
      e.preventDefault()
      // Guardar el evento
      window.deferredPrompt = e
      // Habilitar botón de instalación
      setCanInstall(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    const env = detectPwaBrowserEnv(window.navigator.userAgent)

    // Samsung Internet: mintea un WebAPK con targetSdk viejo que Play Protect
    // bloquea en Android 14+. Guiamos a Chrome en lugar de disparar prompt().
    if (env.kind === 'samsung-internet') {
      showToast(t('pwa_install_samsung_hint'), 'info')
      const schemeUrl = googleChromeSchemeUrl(window.location.href)
      if (schemeUrl) window.location.href = schemeUrl
      return
    }

    // Chrome desactualizado: el WebAPK minteado puede ser rechazado; primero
    // pedimos actualizar desde Play Store.
    if (isChromeOutdatedForWebapk(env)) {
      showToast(t('pwa_install_chrome_outdated_desc'), 'info')
      window.location.href = CHROME_PLAY_STORE_URL
      return
    }

    const promptEvent = window.deferredPrompt
    if (!promptEvent) {
      // Para iOS o navegadores que no soportan beforeinstallprompt
      const isIos = () => {
        const userAgent = window.navigator.userAgent.toLowerCase()
        return /iphone|ipad|ipod/.test(userAgent)
      }
      if (isIos()) {
        showToast(t('pwa_install_ios_hint'), 'info')
      } else {
        showToast(t('pwa_already_installed_or_unsupported'), 'info')
      }
      return
    }

    // Mostrar el prompt nativo
    promptEvent.prompt()

    // Esperar a la respuesta del usuario
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') {
      console.log('Usuario aceptó instalar la PWA')
      setCanInstall(false) // Ocultar botón tras instalar
      window.deferredPrompt = null // Limpiar el evento
    } else {
      console.log('Usuario rechazó instalar la PWA')
    }
  }

  return (
    <article className="config-hub-card" style={{ cursor: 'pointer' }} onClick={handleInstallClick}>
      <span className="config-hub-card-icon" aria-hidden="true">📥</span>
      <div className="config-hub-card-content">
        <h3>{t('config_pwa_install_title')}</h3>
        <p>{t('config_pwa_install_desc')}</p>
      </div>
      <span className="config-hub-card-chevron" aria-hidden="true">›</span>
    </article>
  )
}
