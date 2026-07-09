import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'

export function DatosCard() {
  const navigate = useNavigate()
  return (
    <button type="button" className="config-hub-card" onClick={() => navigate('/privacidad')}>
      <span className="config-hub-card-icon" aria-hidden="true">🛡️</span>
      <div className="config-hub-card-content">
        <h3>{t('config_datos')}</h3>
        <p>{t('config_datos_desc')}</p>
      </div>
      <span className="config-hub-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

export default DatosCard
