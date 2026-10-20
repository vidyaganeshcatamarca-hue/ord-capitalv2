// src/components/configuracion/ConfiguracionBorradoCard.tsx
// Ajustes > Cuenta y seguridad > deletion entry (feature: menu-ajustes, T3, S15).
//
// Two options under ONE access rule (S15/L10: first 15 days no PIN, then the
// PIN configured in mode Avanzado). Since the pi2 app-lock merge, the PIN
// source is the peer-owned single truth: useAppLock().lockState, resolved by
// pinConfiguredFromLockState. Before that merge the card used
// PIN_CONFIGURED_FALLBACK. Owner revision L10 raised the grace window 10 -> 15.
//
// Owner bug (tanda 7): the card compared `lockState === 'activa'`, but the
// resolved state is an object (`{ kind: 'locked' }`) and 'activa' is server
// vocabulary. The cast to string made TypeScript accept a comparison that was
// always false: every user past day 15 with a working PIN was told to configure
// one, which is why Proteccion said "Activada" while this card said otherwise.
//
// S15 also says the user has to PUT the PIN, not merely have it: past the grace
// window the destructive UI stays hidden until fn_verificar_pin accepts it.
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

import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppLock } from '@/contexts/AppLockContext'
import { rpc } from '@/lib/supabase'
import { t, parseError } from '@/locales/i18n'
import { useToast } from '@/contexts/ToastContext'
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal'
import { haptics } from '@/lib/haptics'
import { DeleteAccountCard } from '@/components/privacidad/DeleteAccountCard'
import { PinKeypad } from '@/components/AppLockGate/PinKeypad'
import { pinFailureKey } from '@/lib/pinPanelFlow'
import {
  DELETE_DATA_BACKEND_AVAILABLE,
  pinConfiguredFromLockState,
  resolveDeletionGate,
} from '@/lib/accountDeletionGate'
import './ConfiguracionHub.css'

const DELETE_DATA_CONFIRMATION_TEXT = 'BORRAR DATOS'

export function ConfiguracionBorradoCard() {
  const { session } = useAuth()
  const { showToast } = useToast()
  // PI2 single truth for "has a PIN": the resolved state is a discriminated
  // union of objects. Never compare it against server vocabulary ('activa').
  const { lockState, verifyPin } = useAppLock()
  const pinConfigured = pinConfiguredFromLockState(lockState)
  // One clock read per mount: the gate only needs the account age at render time.
  const now = useMemo(() => new Date(), [])
  const signupAt = session?.user?.created_at ?? null
  const gate = resolveDeletionGate({ signupAt, pinConfigured, now })

  // S15 — past the grace window the PIN must be entered before anything
  // destructive exists in the DOM. The server verifies; this flag only mirrors
  // that one accepted attempt for the current mount.
  const [pinUnlocked, setPinUnlocked] = useState(false)
  const [pinMessageKey, setPinMessageKey] = useState<string | null>(null)
  const [verifyingPin, setVerifyingPin] = useState(false)
  const needsPin = !gate.locked && gate.requiresPin && !pinUnlocked

  const handlePin = async (pin: string) => {
    setVerifyingPin(true)
    try {
      const result = await verifyPin(pin)
      if (result.ok) {
        setPinUnlocked(true)
        setPinMessageKey(null)
        haptics.success()
        return
      }
      setPinMessageKey(pinFailureKey(result.reason))
      haptics.error()
    } finally {
      setVerifyingPin(false)
    }
  }

  // S15/T5c — "borrar mis datos": the account stays, the data resets to zero.
  // Bug 12: the two sub-options start collapsed (bug-12 owner rule).
  const [dataOpen, setDataOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [showDataConfirm, setShowDataConfirm] = useState(false)
  const [dataConfirmText, setDataConfirmText] = useState('')
  const [deletingData, setDeletingData] = useState(false)
  const dataOptionDisabled = !DELETE_DATA_BACKEND_AVAILABLE

  const handleDeleteData = async () => {
    if (dataConfirmText !== DELETE_DATA_CONFIRMATION_TEXT) return
    setDeletingData(true)
    try {
      await rpc('fn_borrar_datos_usuario', {
        p_confirmacion_texto: DELETE_DATA_CONFIRMATION_TEXT,
      })
      showToast(t('settings_delete_data_success'), 'success')
      haptics.success()
      // The server data is gone (account row untouched); a reload drops the
      // stale local caches and the app resumes the fresh onboarding state.
      window.location.reload()
    } catch (err) {
      showToast(parseError(err), 'error')
      haptics.error()
    } finally {
      setDeletingData(false)
      setShowDataConfirm(false)
    }
  }

  return (
    <section className="config-delete-card" aria-labelledby="config-delete-title">
      <header className="config-delete-head">
        <span className="config-hub-card-icon" aria-hidden="true">🗑️</span>
        <div className="config-delete-head-text">
          <h3 id="config-delete-title">{t('settings_delete_title')}</h3>
          <p>{t('settings_delete_help')}</p>
        </div>
      </header>

      {lockState == null ? (
        // The PIN state is still loading. Rendering the locked notice here would
        // flash "configure your PIN" at users who already have one.
        <div className="config-delete-locked" aria-busy="true" />
      ) : gate.locked ? (
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
      ) : needsPin ? (
        // S15 — a PIN exists, but the user has to enter it before the two
        // destructive options are rendered at all.
        <div className="config-delete-pin">
          <p
            className="config-delete-pin-prompt"
            role={pinMessageKey ? 'alert' : undefined}
          >
            {t(pinMessageKey ?? 'settings_delete_pin_prompt')}
          </p>
          <PinKeypad
            compact
            disabled={verifyingPin}
            hint={null}
            onSubmit={(pin) => { void handlePin(pin) }}
          />
        </div>
      ) : (
        <>
          {/* Bug 12 (owner, tanda 2): each sub-option is a collapsed item — the
              title + explanatory text stay visible; tapping reveals the
              destructive UI (input / schedule button). */}
          <div
            className={`config-delete-option${dataOptionDisabled ? ' config-delete-option--disabled' : ''}`}
            aria-disabled={dataOptionDisabled}
          >
            <button
              type="button"
              className="config-delete-option-head"
              aria-expanded={dataOpen}
              onClick={() => { if (!dataOptionDisabled) setDataOpen(!dataOpen) }}
              disabled={dataOptionDisabled}
            >
              <h4>{t('settings_delete_option_data_title')}</h4>
              <p>{t('settings_delete_option_data_desc')}</p>
              {dataOptionDisabled && (
                <p className="config-delete-option-reason">
                  {t('settings_delete_option_data_unavailable')}
                </p>
              )}
            </button>
            {dataOpen && (
              <div className="config-delete-option-body">
                <input
                  className="privacidad-delete-input"
                  type="text"
                  placeholder={t('privacidad_delete_placeholder')}
                  value={dataConfirmText}
                  onChange={(e) => setDataConfirmText(e.target.value.toUpperCase())}
                  autoComplete="off"
                  aria-label={t('settings_delete_option_data_title')}
                />
                <button
                  type="button"
                  className="config-delete-option-run"
                  disabled={deletingData || dataConfirmText !== DELETE_DATA_CONFIRMATION_TEXT}
                  onClick={() => setShowDataConfirm(true)}
                >
                  {deletingData ? '…' : t('settings_delete_option_data_run')}
                </button>
              </div>
            )}
          </div>

          <div className="config-delete-option">
            <button
              type="button"
              className="config-delete-option-head"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen(!accountOpen)}
            >
              <h4>{t('settings_delete_option_account_title')}</h4>
              <p>{t('settings_delete_option_account_desc')}</p>
            </button>
            {accountOpen && (
              <div className="config-delete-option-body">
                <DeleteAccountCard embedded />
              </div>
            )}
          </div>
        </>
      )}

      {/* S15/T5c — data deletion uses the stricter text confirmation (BORRAR
          DATOS) BEFORE the modal: the modal is the final confirmation step. */}
      <ConfirmModal
        isOpen={showDataConfirm}
        type="danger"
        title={t('settings_delete_option_data_title')}
        message={t('settings_delete_option_data_desc')}
        confirmText={t('settings_delete_option_data_run')}
        cancelText={t('btn_cancel')}
        onConfirm={handleDeleteData}
        onCancel={() => setShowDataConfirm(false)}
      />
    </section>
  )
}

export default ConfiguracionBorradoCard
