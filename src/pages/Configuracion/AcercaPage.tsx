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
          <h2>{t('config_about_actions')}</h2>
          <div className="config-section-actions">
            <button type="button" className="config-section-action" disabled>
              <span className="config-section-action-icon" aria-hidden="true">⭐</span>
              <span>
                <span className="config-section-action-title">{t('config_rate_app')}</span>
                <span className="config-section-action-desc">{t('config_rate_desc')}</span>
              </span>
              <span>{t('config_coming_soon')}</span>
            </button>
            <button type="button" className="config-section-action" disabled>
              <span className="config-section-action-icon" aria-hidden="true">📤</span>
              <span>
                <span className="config-section-action-title">{t('config_invite_friend')}</span>
                <span className="config-section-action-desc">{t('config_invite_desc')}</span>
              </span>
              <span>{t('config_coming_soon')}</span>
            </button>
            <button type="button" className="config-section-action" disabled>
              <span className="config-section-action-icon" aria-hidden="true">💡</span>
              <span>
                <span className="config-section-action-title">{t('config_send_suggestion')}</span>
                <span className="config-section-action-desc">{t('config_feedback_desc')}</span>
              </span>
              <span>{t('config_coming_soon')}</span>
            </button>
          </div>
        </article>

        <article className="config-section-card">
          <h2>{t('config_legal')}</h2>
          <div className="config-section-row">
            <span>{t('config_terms')}</span>
            <span>{t('config_coming_soon')}</span>
          </div>
          <div className="config-section-row">
            <span>{t('config_privacy_policy')}</span>
            <span>{t('config_coming_soon')}</span>
          </div>
        </article>
      </section>
    </main>
  )
}

export default AcercaPage
