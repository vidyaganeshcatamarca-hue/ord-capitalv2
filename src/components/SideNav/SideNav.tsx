import { useNavigate, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '@/constants/navigation'
import { t } from '@/locales/i18n'
import { NotificationBell } from '@/components/notificaciones/NotificationBell'
import { useModoApp } from '@/contexts/ModoAppContext'
import './SideNav.css'

interface SideNavProps {
  onAddPress: () => void
}

export function SideNav({ onAddPress }: SideNavProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { hasFeature } = useModoApp()

  return (
    <aside className="side-nav">
      {/* Logo */}
      <div className="side-nav-logo">
        <div className="side-nav-logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M12 2L2 7l10 5 10-5-10-5z" />
            <path strokeLinecap="round" d="M2 17l10 5 10-5" />
            <path strokeLinecap="round" d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="side-nav-logo-text">ORD Capital</span>
      </div>

      {/* Botón principal de acción */}
      <button className="side-nav-fab" onClick={onAddPress} aria-label={t('menu_registrar_movimiento')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
          <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
        </svg>
        <span>{t('menu_registrar')}</span>
      </button>

      <div className="side-nav-bell-row">
        <NotificationBell />
      </div>

      {/* Separador */}
      <div className="side-nav-divider" />

      {/* Items de navegación */}
      <nav className="side-nav-items">
        {NAV_ITEMS.filter(item => hasFeature(item.label)).map((item) => {
          const active = pathname === item.path
          const labelText = item.desktopLabel || item.label
          return (
            <button
              key={item.path}
              className={`side-nav-item ${active ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              aria-label={t(labelText)}
            >
              <span className="side-nav-item-icon">{item.icon(active)}</span>
              <span className="side-nav-item-label">{t(labelText)}</span>
              {active && <span className="side-nav-item-indicator" />}
            </button>
          )
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div className="side-nav-footer">
        <div className="side-nav-footer-badge">
          <span className="dot dot-green" />
          <span>{t('menu_conectado')}</span>
        </div>
        <span className="side-nav-version">v2.0</span>
      </div>
    </aside>
  )
}
