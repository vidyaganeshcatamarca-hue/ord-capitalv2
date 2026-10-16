// src/components/AppLockGate/AppLockGate.tsx
// Full-screen lock overlay (feature: pin-huella, task T3).
//
// Rendered once by AppLockProvider; while there is nothing to enforce it is
// an inert null. Three presented states (src/lib/appLock.ts mapping):
//   locked        → resolve the lock: biometry (if enabled on this device) or
//                   explicit "Usar PIN" (S4: o PIN o huella, no cascade).
//   cooldown      → the 24 h lockout window (S6/owner "24 horas"): shows when
//                   access can be restored; nothing can be entered meanwhile.
//   reset_pending → the lockout cleared the PIN (S7): define a new 4-digit PIN
//                   to continue (server verifies the window is really over).

import { useMemo, useState, useEffect } from 'react'
import { useAppLock } from '@/contexts/AppLockContext'
import { t } from '@/locales/i18n'
import { PinKeypad } from './PinKeypad'
import './AppLockGate.css'

type EntryMode = 'choose' | 'pin' | 'biometria'

export function AppLockGate() {
  const {
    locked,
    lockState,
    attempts,
    waitingBackoffSeconds,
    biometriaEnDispositivo,
    verifyPin,
    definePin,
    unlockWithBiometria,
  } = useAppLock()

  const [mode, setMode] = useState<EntryMode>('choose')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Reset the presented mode each time the overlay opens or the lock state
  // crosses categories (cooldown → reset changes the whole panel).
  useEffect(() => {
    if (locked) {
      setMode(biometriaEnDispositivo ? 'choose' : 'pin')
      setErrorKey(null)
    }
  }, [locked, biometriaEnDispositivo, (lockState as { kind?: string } | null)?.kind])

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
            mode={mode}
            setMode={setMode}
            biometriaEnDispositivo={biometriaEnDispositivo}
            busy={busy}
            errorKey={errorKey}
            setErrorKey={setErrorKey}
            attempts={attempts}
            waitingBackoffSeconds={waitingBackoffSeconds}
            verifyPin={verifyPin}
            setBusy={setBusy}
            unlockWithBiometria={unlockWithBiometria}
          />
        )}
      </div>
    </div>
  )
}

function LockedPanel({
  mode,
  setMode,
  biometriaEnDispositivo,
  busy,
  errorKey,
  setErrorKey,
  attempts,
  waitingBackoffSeconds,
  verifyPin,
  setBusy,
  unlockWithBiometria,
}: {
  mode: EntryMode
  setMode: (m: EntryMode) => void
  biometriaEnDispositivo: boolean
  busy: boolean
  errorKey: string | null
  setErrorKey: (k: string | null) => void
  attempts: number
  waitingBackoffSeconds: number | null
  verifyPin: (pin: string) => Promise<{ ok: boolean; backoffSeconds?: number | null }>
  setBusy: (b: boolean) => void
  unlockWithBiometria: () => Promise<{ ok: boolean }>
}) {
  // S4 — o PIN o huella: with biometry on this device, "Usar PIN" is an
  // explicit secondary action, never a fallback cascade shown automatically.
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

  const tryBiometria = async () => {
    setErrorKey(null)
    setBusy(true)
    const result = await unlockWithBiometria()
    setBusy(false)
    if (!result.ok) setErrorKey('app_lock_biometria_error')
  }

  return (
    <>
      <h1 className="app-lock-title">{t('app_lock_title')}</h1>
      <p className="app-lock-subtitle">{t('app_lock_subtitle')}</p>

      {mode === 'choose' && (
        <div className="app-lock-actions">
          <button
            type="button"
            className="app-lock-primary-action"
            onClick={tryBiometria}
            disabled={busy || showBackoff > 0}
          >
            {t('app_lock_use_biometria')}
          </button>
          <button
            type="button"
            className="app-lock-secondary-action"
            onClick={() => setMode('pin')}
            disabled={busy || showBackoff > 0}
          >
            {t('app_lock_use_pin')}
          </button>
        </div>
      )}

      {mode === 'pin' && (
        <PinKeypad
          disabled={busy || showBackoff > 0}
          hint={attempts > 0 ? t('app_lock_wrong_pin') : null}
          onSubmit={tryPin}
        />
      )}

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