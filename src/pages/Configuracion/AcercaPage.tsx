import { ConfigBackButton } from '@/components/configuracion/ConfigBackButton'
import { t } from '@/locales/i18n'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'

export function AcercaPage() {
  return (
    <main className="page config-page" aria-labelledby="about-config-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="about-config-title">{t('config_section_about')}</h1>
        <p>{t('config_about_desc')}</p>
      </header>

      <section className="config-section-list" aria-label={t('config_section_about')}>
        <article className="config-section-card">
          <h2>{t('config_app_name')}</h2>
          <div className="config-section-row">
            <span>{t('config_version')}</span>
            <span>{t('config_app_version_value')}</span>
          </div>
        </article>

        <article className="config-section-card">
          <h2>{t('config_legal')}</h2>
          <div className="config-section-row">
            <span>{t('config_terms')}</span>
            <span className="config-section-pill">{t('config_coming_soon')}</span>
          </div>
          <div className="config-section-row">
            <span>{t('config_privacy_policy')}</span>
            <span className="config-section-pill">{t('config_coming_soon')}</span>
          </div>
        </article>

        {/* menu-ajustes S7 — Plan/Suscripción placeholder lives here (not in
            Cuenta y seguridad); no subscription flow is implemented yet. */}
        <article className="config-section-card">
          <h2>{t('settings_entry_plan_subscription')}</h2>
          <div className="config-section-row">
            <span>{t('settings_entry_plan_subscription_desc')}</span>
            <span className="config-section-pill">{t('config_coming_soon')}</span>
          </div>
        </article>
      </section>
    </main>
  )
}

export default AcercaPage
