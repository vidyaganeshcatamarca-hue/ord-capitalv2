import { ConfigHogar } from '@/components/ConfigHogar/ConfigHogar'
import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { t } from '@/locales/i18n'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'

export function HogarConfigPage() {
  return (
    <main className="page config-page" aria-labelledby="hogar-config-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="hogar-config-title">{t('config_hogar')}</h1>
        <p>{t('config_hogar_desc')}</p>
      </header>
      <div style={{ maxWidth: 880 }}>
        <ConfigHogar />
      </div>
    </main>
  )
}

export default HogarConfigPage
