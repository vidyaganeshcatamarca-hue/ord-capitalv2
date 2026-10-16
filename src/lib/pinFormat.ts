// src/lib/pinFormat.ts
// PIN format contract for the app-lock feature (feature: pin-huella, spec S6).
// Shared by the lock overlay and the configuration screen so the 4-digit
// rule lives in exactly one place. Pure: callers own every other policy.

export const PIN_LENGTH = 4
export const PIN_PATTERN = /^\d{4}$/

/**
 * The PIN is exactly 4 digits (owner decision). Returns null when valid,
 * otherwise the reason key to show. Deliberately strict: the keypad only
 * produces digits, so this rejects anything that did not come from it.
 */
export function validatePin(pin: unknown): string | null {
  if (typeof pin !== 'string') return 'app_lock_pin_invalido'
  if (!PIN_PATTERN.test(pin)) return 'app_lock_pin_invalido'
  // Reject the degenerate repeats that are not a real secret
  // (0000/1111/2222/3333/4444/5555/6666/7777/8888/9999).
  if (/^(\d)\1{3}$/.test(pin)) return 'app_lock_pin_debil'
  return null
}