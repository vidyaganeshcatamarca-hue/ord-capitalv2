// src/components/AppLockGate/PinKeypad.tsx
// 4-digit numeric keypad shared by the lock overlay and the configuration
// screen (feature: pin-huella). Presentation only: the caller owns policy.

import { useState } from 'react'
import { t } from '@/locales/i18n'

interface PinKeypadProps {
  disabled: boolean
  hint: string | null
  /** Called once with a complete 4-digit PIN (the fourth digit submits). */
  onSubmit: (pin: string) => void
  /**
   * Compact geometry for the embedded Ajustes panel: the whole PIN flow has to
   * fit above the bottom nav without scrolling (owner, tanda 5).
   */
  compact?: boolean
  /**
   * Owner (tanda 8): the same keypad inside a short card left the keys too
   * small to hit. `comfortable` keeps the compact flow but grows the touch
   * targets; the Proteccion panel keeps plain `compact` because it shares the
   * screen with the whole PIN flow.
   */
  size?: KeypadSize
}

/** Geometry presets: default (lock overlay), compact (Proteccion), comfortable (short cards). */
export type KeypadSize = 'compact' | 'comfortable'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const

export function PinKeypad({ disabled, hint, onSubmit, compact = false, size }: PinKeypadProps) {
  // `compact` predates `size`; a caller passing only `compact` keeps tanda-5 geometry.
  const geometry = size ?? (compact ? 'compact' : null)
  const className = `app-lock-keypad${geometry ? ` app-lock-keypad--${geometry}` : ''}`
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
    <div className={className}>
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