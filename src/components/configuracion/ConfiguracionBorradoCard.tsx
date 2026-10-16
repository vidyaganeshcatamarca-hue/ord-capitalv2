// src/components/configuracion/ConfiguracionBorradoCard.tsx
// Ajustes > Cuenta y seguridad > deletion entry (feature: menu-ajustes, T3, S15).
//
// Two options under ONE access rule (S15): the first 10 days of use need no PIN;
// from there on the security PIN configured in mode Avanzado is required. The
// PIN feature does not exist yet (S6 placeholder, T5 gated), so the gate always
// locks past the window and the card shows the hint pointing to Avanzado.
//
//   - "Borrar mis datos": account stays, data restarts from zero. Its RPC does
//     not exist yet (T5 gated), so the option renders disabled with a reason.
//     Nothing here deletes data on the client.
//   - "Borrar la cuenta": archives the account for 30 days. Reuses the existing
//     DeleteAccountCard / fn_eliminar_cuenta_usuario — no logic is copied.
//
// The anchor of the 10 days is the auth signup date (S15 proposal (a) accepted):
// the backend does not expose usuarios.creado_at to the user app, so
// `session.user.created_at` is the only source. No new RPC is added.

import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { t } from '@/locales/i18n'
import { DeleteAccountCard } from '@/components/privacidad/DeleteAccountCard'
import {
  DELETE_DATA_BACKEND_AVAILABLE,
  PIN_CONFIGURED_FALLBACK,
  resolveDeletionGate,
} from '@/lib/accountDeletionGate'
import './ConfiguracionHub.css'

export function ConfiguracionBorradoCard() {
  const { session } = useAuth()
  // One clock read per mount: the gate only needs the account age at render time.
  const now = useMemo(() => new Date(), [])
  const signupAt = session?.user?.created_at ?? null
  const gate = resolveDeletionGate({ signupAt, pinConfigured: PIN_CONFIGURED_FALLBACK, now })

  const dataOptionDisabled = !DELETE_DATA_BACKEND_AVAILABLE

  return (
    <section className="config-delete-card" aria-labelledby="config-delete-title">
      <header className="config-delete-head">
        <span className="config-hub-card-icon" aria-hidden="true">🗑️</span>
        <div className="config-delete-head-text">
          <h3 id="config-delete-title">{t('settings_delete_title')}</h3>
          <p>{t('settings_delete_help')}</p>
        </div>
      </header>

      {gate.locked ? (
        // Locked: no destructive UI at all, just the notice and the way out.
        <div className="config-delete-locked">
          <p>
            {t(
              gate.reason === 'unknown_signup'
                ? 'settings_delete_locked_unknown'
                : 'settings_delete_locked_body',
            )}
          </p>
          {gate.reason === 'pin_required' && (
            <p className="config-delete-locked-hint">{t('settings_delete_locked_hint')}</p>
          )}
        </div>
      ) : (
        <>
          <div
            className={`config-delete-option${dataOptionDisabled ? ' config-delete-option--disabled' : ''}`}
            aria-disabled={dataOptionDisabled}
          >
            <h4>{t('settings_delete_option_data_title')}</h4>
            <p>{t('settings_delete_option_data_desc')}</p>
            {dataOptionDisabled && (
              <p className="config-delete-option-reason">
                {t('settings_delete_option_data_unavailable')}
              </p>
            )}
          </div>

          <div className="config-delete-option">
            <h4>{t('settings_delete_option_account_title')}</h4>
            <p>{t('settings_delete_option_account_desc')}</p>
            <DeleteAccountCard />
          </div>
        </>
      )}
    </section>
  )
}

export default ConfiguracionBorradoCard
