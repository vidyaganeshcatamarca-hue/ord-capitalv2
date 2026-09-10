import { t } from '@/locales/i18n'
import './UpdateRequiredScreen.css'

interface UpdateRequiredScreenProps {
  storeUrl: string
  message?: string
}

/**
 * Pantalla de bloqueo por versión obsoleta (hard block).
 *
 * Sin opción de omitir. Un único botón "Actualizar ahora" abre storeUrl
 * en pestaña nueva.
 */
export function UpdateRequiredScreen({ storeUrl, message }: UpdateRequiredScreenProps) {
  const handleUpdate = () => {
    window.open(storeUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="update-required-screen">
      <div className="update-required-card">
        <h1 className="update-required-title">{t('appversion_required_title')}</h1>
        <p className="update-required-message">{message || t('appversion_required_message')}</p>
        <button type="button" className="btn btn-primary btn-full btn-lg" onClick={handleUpdate}>
          {t('appversion_required_button')}
        </button>
      </div>
    </div>
  )
}
