import { useModoApp } from '@/contexts/ModoAppContext'
import { t } from '@/locales/i18n'

export function ModoAppCard() {
  const { modo, proDisponible, activarModoAvanzado, desactivarModoAvanzado, loading } = useModoApp()

  if (!proDisponible && modo === 'simple') {
    return null // Ocultar si el pro no está disponible y el usuario es simple
  }

  const isAvanzado = modo === 'avanzado'

  return (
    <div className="config-card card">
      <div className="config-card-header">
        <span className="config-card-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-purple)' }}>
          🚀
        </span>
        <div className="config-card-title-group">
          <h3>{t('config_modo_app_title')}</h3>
          <p>{t('config_modo_app_desc')}</p>
        </div>
      </div>
      <div className="config-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'calc(13px * var(--font-scale))', color: 'var(--text)' }}>
            {t('config_modo_actual')}: <strong style={{ color: isAvanzado ? 'var(--accent-purple)' : 'var(--mint)' }}>
              {isAvanzado ? t('modo_avanzado') : t('modo_simple')}
            </strong>
          </span>
          <button
            className={`btn ${isAvanzado ? 'btn-secondary' : 'btn-primary'}`}
            style={{ padding: '6px 12px', fontSize: 'calc(13px * var(--font-scale))' }}
            onClick={isAvanzado ? desactivarModoAvanzado : activarModoAvanzado}
            disabled={loading}
          >
            {loading ? '...' : (isAvanzado ? t('btn_volver_simple') : t('btn_activar_avanzado'))}
          </button>
        </div>
      </div>
    </div>
  )
}
