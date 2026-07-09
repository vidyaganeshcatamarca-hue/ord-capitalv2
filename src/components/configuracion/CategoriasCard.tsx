import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'

export function CategoriasCard() {
  const navigate = useNavigate()
  return (
    <button type="button" className="config-hub-card" onClick={() => navigate('/configuracion/categorias')}>
      <span className="config-hub-card-icon" aria-hidden="true">🏷️</span>
      <div className="config-hub-card-content">
        <h3>{t('config_categorias')}</h3>
        <p>{t('config_categorias_desc')}</p>
      </div>
      <span className="config-hub-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

export default CategoriasCard
