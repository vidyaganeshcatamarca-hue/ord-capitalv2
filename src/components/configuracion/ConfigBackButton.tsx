import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'

interface ConfigBackButtonProps {
  /** Destino explícito. Si se omite, navega a /configuracion */
  to?: string
}

export function ConfigBackButton({ to = '/configuracion' }: ConfigBackButtonProps) {
  const navigate = useNavigate()

  return (
    <button type="button" className="config-back-button" onClick={() => navigate(to)}>
      <span aria-hidden="true">‹</span>
      {t('config_back_to_settings')}
    </button>
  )
}

export default ConfigBackButton
