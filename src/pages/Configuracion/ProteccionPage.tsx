// src/pages/Configuracion/ProteccionPage.tsx
// PIN protection configuration (feature: pin-huella, tasks T4 + T5).
//
// Owner decision (tanda 12): the app lock is PIN-ONLY. The biometrics option was
// removed from this screen and from the lock overlay, because the platform
// WebAuthn prompt is the DEVICE unlock: after a few failed fingerprints
// Android/Chrome offers the phone's pattern, and an accepted pattern returns a
// plain success. The app receives a boolean and cannot tell which modality
// verified, so fingerprints could never be a stricter gate than the phone itself.
//
// Specs covered: S2 (entry lives in Cuenta y seguridad, advanced tree only), S8
// (enable/disable/change demand the current PIN — server-verified), S11 (copy
// through i18n), S12 (flat route).

import { useState, useCallback } from 'react'
import { t } from '@/locales/i18n'
import ConfigBackButton from '@/components/configuracion/ConfigBackButton'
import './ConfiguracionPage.css'
// Owner bug (tanda 3): the back button/card/row styles live in the section
// stylesheet — without it the page rendered unstyled (back button centered by
// the browser default, no card, concatenated rows).
import './ConfigSectionPage.css'
import { useAuth } from '@/contexts/AuthContext'
import { useAppLock } from '@/contexts/AppLockContext'
import { PinKeypad } from '@/components/AppLockGate/PinKeypad'
import { validatePin } from '@/lib/pinFormat'
import {
  nextConfirmationAttempt,
  pinConfirmationOutcome,
  pinFailureKey,
  pinInstructionKey,
  type PinPanelStep,
} from '@/lib/pinPanelFlow'
import type { PinVerifyResult } from '@/contexts/AppLockContext'

type PanelMode = 'idle' | 'activar' | 'cambiar_actual' | 'cambiar_nueva' | 'baja'

/** Maps a failed result to the i18n key of its reason (S11: copy via t()). */
function reasonKey(result: PinVerifyResult): string {
  switch (result.reason) {
    case 'pin_incorrecto':
      return 'app_lock_wrong_pin'
    case 'pin_actual_incorrecto':
      return 'app_lock_wrong_current_pin'
    case 'pin_debil':
      return 'app_lock_pin_debil'
    case 'en_cooldown':
      return 'app_lock_cooldown_message'
    case 'reset_pending':
      return 'app_lock_reset_title'
    case 'unavailable':
      return 'proteccion_backend_pendiente'
    default:
      return 'app_lock_error_generico'
  }
}

export function ProteccionPage() {
  const { session, nombreUsuario } = useAuth()
  const { lockState, definePin, deactivatePin, verifyPin } = useAppLock()

  const [mensajeKey, setMensajeKey] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode>('idle')

  const run = useCallback(
    async (action: () => Promise<PinVerifyResult>, okKey: string) => {
      setMensajeKey(null)
      const result = await action()
      setMensajeKey(result.ok ? okKey : reasonKey(result))
      if (result.ok) setPanelMode('idle')
    },
    [],
  )

  // S6 — the new PIN is validated client-side through the shared pinFormat
  // (rejects weak AAAA before any server trip) and then server-verified.
  const activarPin = useCallback((pin: string) => {
    const error = validatePin(pin)
    if (error) return setMensajeKey(error)
    run(() => definePin(pin), 'proteccion_pin_creado')
  }, [definePin, run])
  const cambiarPin = useCallback(
    (pinActual: string, pinNuevo: string) => {
      const error = validatePin(pinNuevo)
      if (error) return setMensajeKey(error)
      run(() => definePin(pinNuevo, pinActual), 'proteccion_pin_cambiado')
    },
    [definePin, run],
  )
  const desactivarPin = useCallback((pinActual: string) => run(() => deactivatePin(pinActual), 'proteccion_pin_desactivado'), [deactivatePin, run])

  const pinActivado = lockState != null && lockState.kind !== 'sin_pin'

  return (
    <main className="page config-page" aria-labelledby="proteccion-title">
      <ConfigBackButton />
      <header className="config-page-header">
        <h1 id="proteccion-title">{t('proteccion_title')}</h1>
        <p>{t('proteccion_desc')}</p>
      </header>

      <section className="config-section-list" aria-label={t('proteccion_title')}>
        <article className="config-section-card">
          <h2>{t('proteccion_estado_title')}</h2>
          <div className="config-section-row">
            <span>{t('proteccion_estado_pin')}</span>
            <span>{pinActivado ? t('proteccion_estado_activo') : t('proteccion_estado_inactivo')}</span>
          </div>

          {panelMode === 'idle' && (
            <div className="config-section-list" style={{ marginTop: '1rem' }}>
              {pinActivado ? (
                <>
                  <button type="button" className="config-action-button" onClick={() => { setMensajeKey(null); setPanelMode('cambiar_actual') }}>
                    {t('proteccion_cambiar_pin')}
                  </button>
                  <button type="button" className="config-action-button" onClick={() => { setMensajeKey(null); setPanelMode('baja') }}>
                    {t('proteccion_desactivar')}
                  </button>
                </>
              ) : (
                <button type="button" className="config-action-button" onClick={() => { setMensajeKey(null); setPanelMode('activar') }}>
                  {t('proteccion_activar')}
                </button>
              )}
            </div>
          )}

          {panelMode === 'activar' && (
            <NuevoPinPanel
              messageKey={mensajeKey}
              onMessage={setMensajeKey}
              onConfirm={(pin) => void activarPin(pin)}
              onAbort={(key) => {
                setMensajeKey(key)
                setPanelMode('idle')
              }}
            />
          )}
          {panelMode === 'cambiar_actual' && (
            <PinActualPanel
              messageKey={mensajeKey}
              onConfirm={async (pinActual) => {
                // Verify BEFORE asking for the new PIN: a wrong current PIN has
                // to say so right here, not after the whole flow (owner, tanda 5).
                const check = await verifyPin(pinActual)
                if (!check.ok) {
                  setMensajeKey(pinFailureKey(check.reason))
                  return
                }
                setMensajeKey(null)
                pinActualRef.current = pinActual
                setPanelMode('cambiar_nueva')
              }}
            />
          )}
          {panelMode === 'cambiar_nueva' && (
            <NuevoPinPanel
              messageKey={mensajeKey}
              onMessage={setMensajeKey}
              onConfirm={(pinNuevo) => void cambiarPin(pinActualRef.current ?? '', pinNuevo)}
              onAbort={(key) => {
                // Previous screen of this flow: the current-PIN entry.
                pinActualRef.current = undefined
                setMensajeKey(key)
                setPanelMode('cambiar_actual')
              }}
            />
          )}
          {panelMode === 'baja' && (
            <PinActualPanel
              messageKey={mensajeKey}
              onConfirm={(pinActual) => void desactivarPin(pinActual)}
            />
          )}

          {/* One message zone: panels own it while a PIN step is open; the
              section only reports the outcome of the last idle action. */}
          {panelMode === 'idle' && mensajeKey && (
            <p className="config-section-note" role="status">{t(mensajeKey)}</p>
          )}
        </article>
      </section>
    </main>
  )
}

// Ref compartido interno para el paso "cambiar" (actual → nueva); la propia
// página vive unida, así el ref no trasciende el archivo.
const pinActualRef: { current?: string } = { current: undefined }

/**
 * Doble entrada del PIN nuevo (activar / cambio).
 *
 * Owner (tanda 5): the keypad executes on the fourth digit, so the panel has no
 * accept/cancel footer; and it shows ONE message that changes with the step, so
 * an error never sits next to a stale instruction. A mismatched confirmation
 * stays on the confirmation step — that is what makes the warning visible.
 */
function NuevoPinPanel({
  messageKey,
  onMessage,
  onConfirm,
  onAbort,
}: {
  messageKey: string | null
  onMessage: (key: string | null) => void
  onConfirm: (pin: string) => void
  /** Returns to the previous screen after the retries are exhausted. */
  onAbort: (messageKey: string) => void
}) {
  const [primero, setPrimero] = useState<string | null>(null)
  const [intentos, setIntentos] = useState(0)
  const step: PinPanelStep = primero == null ? 'activar_nuevo' : 'activar_confirmar'
  const instruction = pinInstructionKey(step, messageKey)

  return (
    <>
      {instruction && (
        <p className="config-section-note" role={messageKey ? 'alert' : undefined}>{t(instruction)}</p>
      )}
      <PinKeypad
        compact
        disabled={false}
        hint={null}
        onSubmit={(pin) => {
          if (primero == null) {
            // A fresh first entry restarts the confirmation retries.
            setPrimero(pin)
            setIntentos(0)
            onMessage(null)
            return
          }
          if (pinConfirmationOutcome(primero, pin) === 'match') {
            onMessage(null)
            onConfirm(pin)
            return
          }
          // Owner (tanda 6): say the confirmation did not match and ask for the
          // SAME pin again; on the third failure leave the panel, otherwise the
          // user is trapped here forever.
          const next = nextConfirmationAttempt(intentos)
          setIntentos(next.attempts)
          if (next.exhausted) {
            setPrimero(null)
            onAbort(next.messageKey)
            return
          }
          onMessage(next.messageKey)
        }}
      />
    </>
  )
}

/** Entrada única del PIN actual (cambio / desactivar). */
function PinActualPanel({
  messageKey,
  onConfirm,
}: {
  messageKey: string | null
  onConfirm: (pinActual: string) => void
}) {
  const instruction = pinInstructionKey('cambiar_actual', messageKey)
  return (
    <>
      {instruction && (
        <p className="config-section-note" role={messageKey ? 'alert' : undefined}>{t(instruction)}</p>
      )}
      <PinKeypad compact disabled={false} hint={null} onSubmit={onConfirm} />
    </>
  )
}

export default ProteccionPage