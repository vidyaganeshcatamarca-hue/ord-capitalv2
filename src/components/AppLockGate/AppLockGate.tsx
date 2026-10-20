// src/components/AppLockGate/AppLockGate.tsx
// Full-screen lock overlay (feature: pin-huella, task T3).
//
// Rendered once by AppLockProvider; while there is nothing to enforce it is
// an inert null. Three presented states (src/lib/appLock.ts mapping):
//   locked        → the PIN keypad. Owner decision (tanda 12): the app lock is
//                   PIN-ONLY. Biometrics were removed because the platform
//                   prompt IS the device unlock: after a few failed fingerprints
//                   Android/Chrome offers its own pattern, and an accepted
//                   pattern returns a plain WebAuthn success. The app only gets a
//                   boolean and can never tell which modality verified, so the
//                   fingerprint could never be a stricter gate than the phone's
//                   own unlock. The PIN is the only factor this app owns.
//   cooldown      → the 24 h lockout window (S6/owner "24 horas"): shows when
//                   access can be restored; nothing can be entered meanwhile.
//   reset_pending → the lockout cleared the PIN (S7): define a new 4-digit PIN
//                   to continue (server verifies the window is really over).

import { useMemo, useState, useEffect } from 'react'
import { useAppLock } from '@/contexts/AppLockContext'
import { t } from '@/locales/i18n'
import { PinKeypad } from './PinKeypad'
import './AppLockGate.css'

export function AppLockGate() {
  const { locked, lockState, attempts, waitingBackoffSeconds, verifyPin, definePin } = useAppLock()

  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Clear stale messages each time the overlay opens or the lock state crosses
  // categories (cooldown → reset changes the whole panel).
  useEffect(() => {
    if (locked) setErrorKey(null)
  }, [locked, (lockState as { kind?: string } | null)?.kind])

  if (!locked || !lockState || lockState.kind === 'sin_pin') return null

  const lock = lockState as Exclude<typeof lockState, { kind: 'sin_pin' }>

  return (
    <div className="app-lock-gate" role="dialog" aria-modal="true" aria-label={t('app_lock_title')}>
      <div className="app-lock-card">
        {lock.kind === 'cooldown' && <CooldownPanel endsAt={lock.endsAt} />}
        {lock.kind === 'reset_pending' && (
          <DefinePinPanel
            busy={busy}
            onSubmit={async (pin) => {
              setBusy(true)
              setErrorKey(null)
              const result = await definePin(pin)
              setBusy(false)
              if (!result.ok) setErrorKey('app_lock_error_generico')
            }}
          />
        )}
        {lock.kind === 'locked' && (
          <LockedPanel
            busy={busy}
            errorKey={errorKey}
            setErrorKey={setErrorKey}
            attempts={attempts}
            waitingBackoffSeconds={waitingBackoffSeconds}
            verifyPin={verifyPin}
            setBusy={setBusy}
          />
        )}
      </div>
    </div>
  )
}

function LockedPanel({
  busy,
  errorKey,
  setErrorKey,
  attempts,
  waitingBackoffSeconds,
  verifyPin,
  setBusy,
}: {
  busy: boolean
  errorKey: string | null
  setErrorKey: (k: string | null) => void
  attempts: number
  waitingBackoffSeconds: number | null
  verifyPin: (pin: string) => Promise<{ ok: boolean; backoffSeconds?: number | null }>
  setBusy: (b: boolean) => void
}) {
  const [showBackoff, setShowBackoff] = useState(0)
  useEffect(() => {
    if (!waitingBackoffSeconds) return
    setShowBackoff(waitingBackoffSeconds)
    const id = setInterval(() => {
      setShowBackoff((s) => {
        if (s <= 1) {
          clearInterval(id)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [waitingBackoffSeconds])

  const tryPin = async (pin: string) => {
    setErrorKey(null)
    setBusy(true)
    const result = await verifyPin(pin)
    setBusy(false)
    if (!result.ok) setErrorKey('app_lock_wrong_pin')
  }

  return (
    <>
      <h1 className="app-lock-title">{t('app_lock_title')}</h1>
      <p className="app-lock-subtitle">{t('app_lock_subtitle')}</p>

      <PinKeypad
        disabled={busy || showBackoff > 0}
        hint={attempts > 0 ? t('app_lock_wrong_pin') : null}
        onSubmit={tryPin}
      />

      {showBackoff > 0 && (
        <p className="app-lock-hint" role="status">
          {t('app_lock_backoff', { segundos: showBackoff })}
        </p>
      )}
      {errorKey && showBackoff === 0 && <p className="app-lock-error" role="alert">{t(errorKey)}</p>}
    </>
  )
}

function CooldownPanel({ endsAt }: { endsAt: string }) {
  const endsLabel = useMemo(() => {
    try {
      return new Date(endsAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
    } catch {
      return endsAt
    }
  }, [endsAt])
  return (
    <>
      <h1 className="app-lock-title">{t('app_lock_title')}</h1>
      <p className="app-lock-subtitle">{t('app_lock_cooldown_message')}</p>
      <p className="app-lock-cooldown-ends" role="status">{endsLabel}</p>
    </>
  )
}

function DefinePinPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (pin: string) => Promise<void> }) {
  const [firstPin, setFirstPin] = useState<string | null>(null)
  const [mismatch, setMismatch] = useState(false)
  if (firstPin == null) {
    return (
      <>
        <h1 className="app-lock-title">{t('app_lock_reset_title')}</h1>
        <p className="app-lock-subtitle">{t('app_lock_reset_subtitle')}</p>
        <PinKeypad
          disabled={busy}
          hint={null}
          onSubmit={(pin) => {
            setFirstPin(pin)
            setMismatch(false)
          }}
        />
      </>
    )
  }
  return (
    <>
      <h1 className="app-lock-title">{t('app_lock_reset_title')}</h1>
      <p className="app-lock-subtitle">{t('app_lock_reset_confirm_subtitle')}</p>
      <PinKeypad
        disabled={busy}
        hint={mismatch ? t('app_lock_pin_mismatch') : null}
        onSubmit={(pin) => {
          if (pin === firstPin) {
            void onSubmit(pin)
          } else {
            setMismatch(true)
            setFirstPin(null)
          }
        }}
      />
    </>
  )
}
