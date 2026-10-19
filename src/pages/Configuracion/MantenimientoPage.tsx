// L17 (owner, tanda 2): Ajustes > Aplicación > Mantenimiento opens as its own
// screen; back returns to the hub (which preserves the expanded section).
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { MantenimientoAppCard } from '@/components/configuracion/MantenimientoAppCard'
import { t } from '@/locales/i18n'
import './NotificacionesPage.css'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'

export function MantenimientoPage() {
  return (
    <div className="config-section-page" aria-label={t('settings_entry_maintenance')}>
      <ConfigBackButton />
      <MantenimientoAppCard />
    </div>
  )
}

export default MantenimientoPage