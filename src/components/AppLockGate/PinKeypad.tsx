// src/components/AppLockGate/PinKeypad.tsx
// 4-digit numeric keypad shared by the lock overlay and the configuration
// screen (feature: pin-huella). Presentation only: the caller owns policy.

import { useState } from 'react'
import { t } from '@/locales/i18n'

interface PinKeypadProps {
  disabled: boolean
  hint: string | null
  /** Called once with a complete 4-digit PIN. */
  onSubmit: (pin: string) => void
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const

export function PinKeypad({ disabled, hint, onSubmit }: PinKeypadProps) {
  const [pin, setPin] = useState('')

  const push = (digit: string) => {
    if (disabled) return
    const next = (pin + digit).slice(0, 4)
    setPin(next)
    if (next.length === 4) {
      // Slight delay so the fourth dot is visibly filled before submission.
      setTimeout(() => {
        onSubmit(next)
        setPin('')
      }, 200)
    }
  }

  const erase = () => {
    if (disabled) return
    setPin('')
  }

  return (
    <div className="app-lock-keypad">
      <div className="app-lock-dots" aria-live="polite" aria-label={t('app_lock_pin_entry')}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`app-lock-dot${i < pin.length ? ' app-lock-dot--filled' : ''}`} />
        ))}
      </div>
      {hint && <p className="app-lock-hint" role="status">{hint}</p>}
      <div className="app-lock-keys" role="group" aria-label={t('app_lock_keypad')}>
        {DIGITS.map((d, i) =>
          d === '' ? (
            <span key={i} className="app-lock-key app-lock-key--spacer" />
          ) : d === 'back' ? (
            <button key={i} type="button" className="app-lock-key" onClick={erase} disabled={disabled}>
              {t('app_lock_erase')}
            </button>
          ) : (
            <button key={i} type="button" className="app-lock-key" onClick={() => push(d)} disabled={disabled}>
              {d}
            </button>
          ),
        )}
      </div>
    </div>
  )
}