// L17 (owner, tanda 2): Ajustes > Cuenta y seguridad > Borrado opens as its own
// screen; back returns to the hub (which preserves the expanded section).
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { ConfiguracionBorradoCard } from '@/components/configuracion/ConfiguracionBorradoCard'
import { t } from '@/locales/i18n'
import './NotificacionesPage.css'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'

export function BorradoPage() {
  return (
    <main className="page config-page" aria-label={t('settings_entry_data_deletion')}>
      <ConfigBackButton />
      <ConfiguracionBorradoCard />
    </main>
  )
}

export default BorradoPage