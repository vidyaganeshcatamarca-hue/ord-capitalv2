import { t } from '@/locales/i18n'
import './WelcomeBack.css'

interface WelcomeBackProps {
  email: string
  onContinue: () => void
  onSwitchAccount: () => void
}

/**
 * Pantalla de recuperación de onboarding incompleto.
 *
 * Muestra el email de la cuenta activa y dos acciones:
 *   - "Continuar con esta cuenta" → reanuda onboarding (slide 3).
 *   - "Usar otra cuenta" → signOut + limpiar localStorage + reset.
 */
export function WelcomeBack({ email, onContinue, onSwitchAccount }: WelcomeBackProps) {
  return (
    <div className="welcome-back">
      <div className="welcome-back-card">
        <h2 className="welcome-back-title">{t('welcomeback_title')}</h2>
        <p className="welcome-back-subtitle">{t('welcomeback_subtitle')}</p>

        {email && <p className="welcome-back-email">{email}</p>}

        <button type="button" className="btn btn-primary btn-full btn-lg" onClick={onContinue}>
          {t('welcomeback_continue')}
        </button>
        <button type="button" className="btn btn-ghost btn-full" onClick={onSwitchAccount}>
          {t('welcomeback_switch')}
        </button>
      </div>
    </div>
  )
}
