// L17 (owner, tanda 2): Ajustes > Preferencias > Apariencia opens as its own
// screen; back returns to the hub (which preserves the expanded section).
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { AparienciaCard } from '@/components/configuracion/AparienciaCard'
import { t } from '@/locales/i18n'
import { useOptionalAuth } from '@/contexts/AuthContext'
import './NotificacionesPage.css'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'

export function AparienciaPage() {
  const userId = useOptionalAuth()?.session?.user?.id ?? ''
  return (
    <main className="page config-page" aria-label={t('settings_entry_appearance')}>
      <ConfigBackButton />
      <AparienciaCard userId={userId} defaultOpen />
    </main>
  )
}

export default AparienciaPage