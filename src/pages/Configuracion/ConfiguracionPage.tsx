import { ConfiguracionFull } from '@/components/configuracion/ConfiguracionFull'
import { useNavigate } from 'react-router-dom'
import { t } from '@/locales/i18n'
import './ConfiguracionPage.css'

export function ConfiguracionPage() {
  const navigate = useNavigate()

  return (
    <main className="page config-page" aria-labelledby="config-title">
      <header className="config-page-header">
        <h1 id="config-title">{t('config_title')}</h1>
        <p>{t('config_subtitle')}</p>
      </header>
      <ConfiguracionFull />

      {/* Support entries: same row styling as the hub cards. Router state
        * carries the source route so the report page can send p_pantalla. */}
      <div className="config-hub config-support-hub">
        <button
          type="button"
          className="config-hub-card"
          onClick={() => navigate('/reportar-problema', { state: { origen: '/configuracion' } })}
        >
          <span className="config-hub-card-icon" aria-hidden="true">🐞</span>
          <div className="config-hub-card-content">
            <h3>{t('ajustes_reportar_problema')}</h3>
            <p>{t('ajustes_reportar_problema_desc')}</p>
          </div>
          <span className="config-hub-card-chevron" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="config-hub-card"
          onClick={() => navigate('/mis-reportes', { state: { origen: '/configuracion' } })}
        >
          <span className="config-hub-card-icon" aria-hidden="true">📋</span>
          <div className="config-hub-card-content">
            <h3>{t('ajustes_mis_reportes')}</h3>
            <p>{t('ajustes_mis_reportes_desc')}</p>
          </div>
          <span className="config-hub-card-chevron" aria-hidden="true">›</span>
        </button>
      </div>
    </main>
  )
}

export default ConfiguracionPage
