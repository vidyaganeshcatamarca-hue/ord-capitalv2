import { ConfiguracionFull } from '@/components/configuracion/ConfiguracionFull'
import { t } from '@/locales/i18n'
import './ConfiguracionPage.css'

export function ConfiguracionPage() {
  return (
    <main className="page config-page" aria-labelledby="config-title">
      <header className="config-page-header">
        <h1 id="config-title">{t('config_title')}</h1>
        <p>{t('config_subtitle')}</p>
      </header>
      <ConfiguracionFull />
    </main>
  )
}

export default ConfiguracionPage
