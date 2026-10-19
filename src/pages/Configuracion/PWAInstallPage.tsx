// L17 (owner, tanda 2): Ajustes > Aplicación > Instalar la app opens as its own
// screen; back returns to the hub (which preserves the expanded section).
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { PWACard } from '@/components/configuracion/PWACard'
import { t } from '@/locales/i18n'
import './NotificacionesPage.css'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'

export function PWAInstallPage() {
  return (
    <main className="page config-page" aria-label={t('settings_entry_install_app')}>
      <ConfigBackButton />
      <PWACard />
    </main>
  )
}

export default PWAInstallPage