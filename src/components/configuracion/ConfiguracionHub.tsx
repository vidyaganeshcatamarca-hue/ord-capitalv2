import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { rpc } from '@/lib/supabase'
import { t } from '@/locales/i18n'
import { ToggleSwitch } from './ToggleSwitch'
import { MiCuentaCard } from './MiCuentaCard'
import { AparienciaCard } from './AparienciaCard'
import { NotificacionesCard } from './NotificacionesCard'
import './ConfiguracionHub.css'

const BASE_CERO_HOME_KEY = 'base_cero_como_inicio'

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

function PresupuestoCicloCard() {
  const navigate = useNavigate()
  const [isBaseCero, setIsBaseCero] = useState(false)
  const [baseCeroComoInicio, setBaseCeroComoInicio] = useState(
    () => localStorage.getItem(BASE_CERO_HOME_KEY) === 'true'
  )

  useEffect(() => {
    let cancelled = false
    rpc<Array<{ modo_presupuesto: string }>>('fn_obtener_preferencias_usuario')
      .then((data) => {
        if (cancelled) return
        const row = Array.isArray(data) ? data[0] : data
        if (row?.modo_presupuesto === 'base_cero') setIsBaseCero(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const toggleBaseCeroInicio = (val: boolean) => {
    setBaseCeroComoInicio(val)
    localStorage.setItem(BASE_CERO_HOME_KEY, String(val))
    window.dispatchEvent(new Event('base-cero-home-changed'))
  }

  return (
    <article className="config-hub-card presupuesto-ciclo-card" aria-labelledby="presupuesto-ciclo-title">
      <button
        type="button"
        className="presupuesto-ciclo-header"
        onClick={() => navigate('/presupuesto?openConfig=1&returnTo=configuracion')}
        aria-label={t('config_presupuesto_config_btn')}
      >
        <span className="config-hub-card-icon" aria-hidden="true">💰</span>
        <div className="config-hub-card-content">
          <h3 id="presupuesto-ciclo-title">{t('config_section_budget')}</h3>
          <p>{t('config_budget_desc')}</p>
        </div>
        <span className="config-hub-card-chevron" aria-hidden="true">›</span>
      </button>

      {isBaseCero && (
        <div className="presupuesto-ciclo-toggle">
          <div className="presupuesto-ciclo-toggle-label">
            <span>{t('config_base_cero_home_toggle')}</span>
            <p>{t('config_base_cero_home_toggle_desc')}</p>
          </div>
          <ToggleSwitch checked={baseCeroComoInicio} onChange={toggleBaseCeroInicio} />
        </div>
      )}
    </article>
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
      <PresupuestoCicloCard />
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
