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
 *
 * Owner rule (tanda 5): there is NO strength policy. The user is free to pick
 * any four digits — repeating ones (0000, 1234's siblings, 9999) included. The
 * old "too simple" rejection is gone on purpose; do not reintroduce it here.
 */
export function validatePin(pin: unknown): string | null {
  if (typeof pin !== 'string') return 'app_lock_pin_invalido'
  if (!PIN_PATTERN.test(pin)) return 'app_lock_pin_invalido'
  return null
}
