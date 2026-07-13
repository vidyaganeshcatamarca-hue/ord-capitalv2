import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'

export function ConfigBackButton() {
  const navigate = useNavigate()

  return (
    <button type="button" className="config-back-button" onClick={() => navigate('/configuracion')}>
      <span aria-hidden="true">‹</span>
      {t('config_back_to_settings')}
    </button>
  )
}

export default ConfigBackButton
