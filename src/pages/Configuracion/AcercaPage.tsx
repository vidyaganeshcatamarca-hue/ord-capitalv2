import { useState } from 'react'
import { t } from '@/locales/i18n'
import { LegalDocModal } from '@/components/LegalDocModal/LegalDocModal'
import './ConfiguracionPage.css'
import './ConfigSectionPage.css'

type LegalDoc = 'tyc' | 'privacidad'

/**
 * S4 — inline body of the "Acerca de" card. Holds Versión, Legal and the
 * Plan/Suscripción placeholder. The legal rows open the shared LegalDocModal
 * (iframe + opening telemetry) instead of showing Próximamente. The hub mounts
 * this body inside the Acerca de accordion card; the standalone page, its header
 * and its back button are gone.
 */
export function ConfigAboutBody() {
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null)

  return (
    <>
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
          {/* S4 — the docs already ship as /legal/*.html (used by onboarding);
              here they open in the shared modal, no new asset is created. */}
          <button
            type="button"
            className="config-section-row config-section-row--link"
            onClick={() => setLegalDoc('tyc')}
          >
            <span>{t('config_terms')}</span>
            <span className="config-section-row-chevron" aria-hidden="true">›</span>
          </button>
          <button
            type="button"
            className="config-section-row config-section-row--link"
            onClick={() => setLegalDoc('privacidad')}
          >
            <span>{t('config_privacy_policy')}</span>
            <span className="config-section-row-chevron" aria-hidden="true">›</span>
          </button>
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

      <LegalDocModal
        doc={legalDoc ?? 'tyc'}
        open={legalDoc !== null}
        onClose={() => setLegalDoc(null)}
      />
    </>
  )
}
