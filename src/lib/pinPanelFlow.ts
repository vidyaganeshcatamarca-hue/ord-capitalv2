// src/lib/pinPanelFlow.ts
// Pure flow rules for the PIN panel of Ajustes → Protección con PIN o huella.
// ZERO imports: the Node test runner imports this file directly with its type
// stripping (same convention as transferTitles.ts).
//
// Owner bug batch (tanda 5): the panel showed the step instruction in one place
// and the error below the cancel button in another, so the user could not tell
// which message was current; a mismatched confirmation lost its message, and a
// wrong current PIN produced no feedback at all.
//
// Two rules live here:
//   1. ONE message zone: the current error replaces the step instruction.
//   2. A confirmation mismatch keeps the confirmation step (never falls back to
//      the first entry, which is what swallowed the message).

/** Every step the embedded panel can present. */
export type PinPanelStep =
  | 'idle'
  | 'activar_nuevo'
  | 'activar_confirmar'
  | 'cambiar_actual'
  | 'cambiar_nuevo'
  | 'cambiar_confirmar'
  | 'baja_actual'

/** Instruction copy for each step, shown when there is no error to report. */
export const PIN_STEP_INSTRUCTION: Record<PinPanelStep, string | null> = {
  idle: null,
  activar_nuevo: 'app_lock_reset_subtitle',
  activar_confirmar: 'app_lock_reset_confirm_subtitle',
  cambiar_actual: 'proteccion_pedir_pin_actual',
  cambiar_nuevo: 'app_lock_reset_subtitle',
  cambiar_confirmar: 'app_lock_reset_confirm_subtitle',
  baja_actual: 'proteccion_pedir_pin_actual',
}

/**
 * The single message the panel shows: the pending error wins over the step
 * instruction, so there is never a stale instruction next to a fresh error.
 */
export function pinInstructionKey(step: PinPanelStep, messageKey: string | null): string | null {
  if (messageKey) return messageKey
  return PIN_STEP_INSTRUCTION[step] ?? null
}

/** Result of comparing the two entries of a new PIN. */
export function pinConfirmationOutcome(first: string | null, second: string | null): 'match' | 'mismatch' {
  if (!first || !second) return 'mismatch'
  return first === second ? 'match' : 'mismatch'
}

/**
 * Message key for a failed PIN verification, from the reason the lock context
 * reports. `pin_actual_incorrecto` and `pin_incorrecto` share the "wrong PIN"
 * copy: the user only needs to know the PIN is not the stored one.
 */
export function pinFailureKey(reason: string | null | undefined): string {
  switch (reason) {
    case 'pin_actual_incorrecto':
    case 'pin_incorrecto':
      return 'app_lock_wrong_current_pin'
    case 'en_cooldown':
    case 'reset_pending':
      return 'app_lock_cooldown_message'
    case 'unavailable':
      return 'proteccion_backend_pendiente'
    case 'error':
    default:
      return 'app_lock_error_generico'
  }
}

/** Confirmation retries allowed before the panel sends the user back. */
export const PIN_CONFIRM_MAX_ATTEMPTS = 3

export interface ConfirmationAttemptResult {
  /** Total failed confirmations after this one. */
  attempts: number
  /** True when the panel must return to the previous screen. */
  exhausted: boolean
  /** Copy to show right now. */
  messageKey: string
}

/**
 * Owner rule (tanda 6): a failed confirmation says so plainly and asks for the
 * SAME PIN again. On the third failure the panel goes back to the previous
 * screen with "los PIN no coinciden" — the old behaviour kept the user trapped
 * in the confirmation forever with no way out.
 */
export function nextConfirmationAttempt(previousAttempts: number): ConfirmationAttemptResult {
  const attempts = (Number.isFinite(previousAttempts) ? Math.max(0, previousAttempts) : 0) + 1
  const exhausted = attempts >= PIN_CONFIRM_MAX_ATTEMPTS
  return {
    attempts,
    exhausted,
    messageKey: exhausted ? 'app_lock_pin_confirm_failed' : 'app_lock_pin_confirm_retry',
  }
}
