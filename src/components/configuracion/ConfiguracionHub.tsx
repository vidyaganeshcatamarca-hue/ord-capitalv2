import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { t } from '@/locales/i18n'
import { MiCuentaCard } from './MiCuentaCard'
import { ModoAppCard } from './ModoAppCard'
import { AparienciaCard } from './AparienciaCard'
import { NotificacionesCard } from './NotificacionesCard'
import './ConfiguracionHub.css'

interface ConfigLinkCardProps {
  icon: string
  titleKey: string
  descKey: string
  to: string
}

function ConfigLinkCard({ icon, titleKey, descKey, to }: ConfigLinkCardProps) {
  const navigate = useNavigate()

  return (
    <button type="button" className="config-hub-card" onClick={() => navigate(to)}>
      <span className="config-hub-card-icon" aria-hidden="true">{icon}</span>
      <div className="config-hub-card-content">
        <h3>{t(titleKey)}</h3>
        <p>{t(descKey)}</p>
      </div>
      <span className="config-hub-card-chevron" aria-hidden="true">›</span>
    </button>
  )
}

export function ConfiguracionHub() {
  const { user } = useAuth()

  return (
    <div className="config-hub">
      <MiCuentaCard />
      <ConfigLinkCard
        icon="🌍"
        titleKey="config_section_region"
        descKey="config_region_desc"
        to="/configuracion/region"
      />
      <ConfigLinkCard
        icon="💰"
        titleKey="config_section_budget"
        descKey="config_budget_desc"
        to="/presupuesto?openConfig=1&returnTo=configuracion"
      />
      <ModoAppCard />
      <NotificacionesCard />
      <AparienciaCard userId={user?.id} />
      <ConfigLinkCard
        icon="📊"
        titleKey="config_section_operational"
        descKey="config_operational_desc"
        to="/configuracion/operativas"
      />
      <ConfigLinkCard
        icon="📱"
        titleKey="config_section_about"
        descKey="config_about_desc"
        to="/configuracion/acerca"
      />
    </div>
  )
}

export default ConfiguracionHub
