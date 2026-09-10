import { useState } from 'react'
import { t } from '@/locales/i18n'
import './UpdateAvailableBanner.css'

interface UpdateAvailableBannerProps {
  storeUrl: string
  mandatory: boolean
  message?: string
}

const DISMISSED_KEY = 'appversion_banner_dismissed'

/**
 * Banner de actualización disponible (no bloqueante).
 *
 * - "Actualizar" abre storeUrl en pestaña nueva.
 * - "Más tarde" solo visible si !mandatory; oculta el banner para la
 *   sesión (flag en localStorage).
 * - Si mandatory, no hay botón de descarte (banner persistente).
 */
export function UpdateAvailableBanner({ storeUrl, mandatory, message }: UpdateAvailableBannerProps) {
  const [dismissed, setDismissed] = useState(
    () => !mandatory && localStorage.getItem(DISMISSED_KEY) === 'true'
  )

  if (dismissed) return null

  const handleUpdate = () => {
    window.open(storeUrl, '_blank', 'noopener,noreferrer')
  }

  const handleLater = () => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className="update-banner" role="region" aria-label={t('appversion_banner_title')}>
      <div className="update-banner-content">
        <div className="update-banner-text">
          <span className="update-banner-title">{t('appversion_banner_title')}</span>
          <span className="update-banner-message">{message || t('appversion_banner_message')}</span>
        </div>
        <div className="update-banner-actions">
          <button type="button" className="btn btn-primary" onClick={handleUpdate}>
            {t('appversion_banner_update')}
          </button>
          {!mandatory && (
            <button type="button" className="btn btn-ghost" onClick={handleLater}>
              {t('appversion_banner_later')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
