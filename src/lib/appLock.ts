// src/lib/appLock.ts
// Policy for the app-lock feature: PIN/biometric lock of app access
// (feature: pin-huella, task T2).
//
// Pure on purpose: no React, no backend/client calls, no DOM, no clock reads.
// The caller injects `now` (and the server supplies the PIN state), so every
// decision is deterministic and unit-testable — same convention as
// `src/lib/accountDeletionGate.ts` (feature menu-ajustes).
//
// Specs covered (odd/tasks/pin-huella.md):
//   S5 — lock on app open + on returning from background after more than 1 min;
//        applies whenever a session exists (no fresh-session bypass); active in
//        every mode.
//   S6 — growing backoff after failed attempts; the 10th invalid attempt
//        triggers a 24-hour lockout. The attempt counter, backoff state and
//        lockout window live in Supabase (server-side) so nothing can be
//        cleared by erasing local app data.
//   S7 — when the lockout window ends, the server clears the PIN and the app
//        asks for a new one ('restaurar'); a biometric unlock cancels the
//        lockout and re-arms the PIN (handled by the caller through the RPCs,
//        not here).

/**
 * S5 — minimum background stay that re-arms the lock on return. The owner's
 * rule is "more than 1 minute": exactly 60 s does not lock.
 */
export const BACKGROUND_RELOCK_THRESHOLD_MS = 60_000

/**
 * S6 — lockout duration once the attempt threshold is reached (owner: 24 h).
 */
export const LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000

/**
 * S6 — the lockout is triggered ON the 10th invalid attempt (owners' "10
 * intentos mal"). Attempts 1..9 only pay the growing backoff.
 */
export const MAX_FAILED_ATTEMPTS = 10

/**
 * S6 — first backoff step, in seconds (owner: "5s → 10s → 20s…").
 */
export const BACKOFF_BASE_SECONDS = 5

/**
 * Server-side PIN state vocabulary (contract with the backend RPCs of T5 /
 * spec S9). Only the server is authoritative; unknown values fail closed.
 */
export type PinServerState =
  // No PIN configured: nothing to enforce.
  | 'sin_pin'
  // PIN active on the account: the device lock applies while a session exists.
  | 'activa'
  // Attempt threshold reached: lockout window set by the server until
  // `bloqueado_hasta`; the app is not usable during that window.
  | 'en_cooldown'
  // Server already cleared the PIN after the window: the caller must collect a
  // new 4-digit PIN before letting anyone through.
  | 'restaurar'

export type LockState =
  // No PIN: no lock; the feature is still configurable from Ajustes.
  | { kind: 'sin_pin' }
  // Locked: the caller must resolve the lock (PIN or biometric, spec S4) or is
  // waiting on a lockout window.
  | { kind: 'locked' }
  // Lockout window running; the caller shows when access can be restored.
  | { kind: 'cooldown'; endsAt: string; msRemaining: number }
  // Lockout over (or server state says so): define a new PIN to enter.
  | { kind: 'reset_pending' }

/**
 * S5 — whether a return from background re-arms the lock. `goneBackgroundAtMs`
 * is the timestamp at which the app went to the background (`null` when this
 * session never went to the background, e.g. a fresh cold start), and
 * `returnedAtMs` is the return timestamp. More than 1 minute locks
 * (owner wording: "más de 1 minuto de estar en segundo plano").
 */
export function backgroundReturnLocks(
  goneBackgroundAtMs: number | null | undefined,
  returnedAtMs: number,
  thresholdMs: number = BACKGROUND_RELOCK_THRESHOLD_MS,
): boolean {
  if (goneBackgroundAtMs == null || goneBackgroundAtMs < 0) return false
  const elapsed = returnedAtMs - goneBackgroundAtMs
  if (elapsed < 0) return false
  return elapsed > thresholdMs
}

/**
 * S6 — seconds the caller must wait after the Nth failed attempt (1-based)
 * before offering the next one. Doubling per the owner's spec, starting at 5.
 *
 * `null` from the threshold on: the 10th (or later) invalid attempt is a
 * lockout (server-side window) — there is no backoff step to honor anymore.
 * Non-positive or non-integer counts are invalid and rejected.
 */
export function retryBackoffSeconds(failedAttempts: number): number | null {
  if (!Number.isInteger(failedAttempts) || failedAttempts <= 0) {
    throw new RangeError('failedAttempts must be a positive integer')
  }
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) return null
  return BACKOFF_BASE_SECONDS * 2 ** (failedAttempts - 1)
}

/**
 * How a server-status refresh was requested.
 *
 * - `arm`: the caller WANTS the lock to come back if the server says the PIN is
 *   enforcing (cold start, return from background).
 * - `silent`: pure data refresh after a resolution already succeeded (PIN
 *   verified, PIN defined, biometry unlocked). It must NEVER re-arm the lock.
 *
 * The distinction is the whole point: reading the status again after a correct
 * PIN returns `estado='activa'` (the PIN *is* active — that is what protects
 * the app), and mapping that back to `locked` trapped the user on the overlay
 * forever (owner tanda 4, bug 1).
 */
export type StatusRefreshMode = 'arm' | 'silent'

/**
 * Decides whether a status refresh may present the lock overlay.
 *
 * Only an `arm` refresh on an enforcing state locks. A `silent` refresh never
 * does, whatever the server says, so a successful resolution stays resolved.
 */
export function statusRefreshArmsLock(
  mode: StatusRefreshMode,
  estado: PinServerState | string | null | undefined,
): boolean {
  if (mode !== 'arm') return false
  return estado === 'activa' || estado === 'en_cooldown'
}

/**
 * Owner (tanda 9, spec S4 revision): when biometry is registered on this device
 * it is the ONLY way in — the lock screen must not ask "PIN or fingerprint?".
 * The PIN appears only as a fallback, after biometry has failed this many times
 * in a row (owner: "a menos que la huella no se pueda detectar por algún
 * problema de tres veces, ahí recién le podemos pedir un PIN").
 */
export const BIOMETRIC_MAX_ATTEMPTS = 3

/** Which entry the lock screen presents. */
export type LockEntryMode = 'biometria' | 'pin'

/**
 * Resolves the entry mode for the lock overlay.
 *
 *   no biometry on this device      → pin
 *   biometry, fewer than 3 failures → biometria
 *   biometry, 3+ failures           → pin (the only remaining way in)
 *
 * Garbage failure counts fail closed to the PIN: it is the path that cannot be
 * blocked by a broken sensor or a cancelled platform prompt.
 */
export function lockEntryMode(
  biometriaEnDispositivo: boolean,
  biometricFailures: number,
): LockEntryMode {
  if (!biometriaEnDispositivo) return 'pin'
  const failures = Number.isFinite(biometricFailures)
    ? Math.max(0, Math.trunc(biometricFailures))
    : BIOMETRIC_MAX_ATTEMPTS
  return failures >= BIOMETRIC_MAX_ATTEMPTS ? 'pin' : 'biometria'
}

/**
 * S3/S6/S7 — maps the server-side PIN state to what the lock UI should show.
 *
 * The server clears `bloqueado_hasta`/PIN at the end of the window; the client
 * may optimistically present 'reset_pending' once that instant passes because
 * the RPC that saves the new PIN is the authoritative check (the server would
 * reject a still-running window).
 *
 * Unknown, missing or malformed server states fail closed (locked): showing
 * the lock screen is always safe; letting someone through by accident is not.
 * (Unlocking itself requires a server RPC anyway, so a locked screen plus a
 * server outage degrades to "service unavailable", never to "open".)
 */
export function resolveLockState(
  estado: PinServerState | string | null | undefined,
  bloqueadoHasta: string | null | undefined,
  now: Date,
): LockState {
  switch (estado) {
    case 'sin_pin':
      return { kind: 'sin_pin' }
    case 'activa':
      return { kind: 'locked' }
    case 'restaurar':
      return { kind: 'reset_pending' }
    case 'en_cooldown': {
      const endsAt = bloqueadoHasta
      if (typeof endsAt !== 'string' || endsAt === '') {
        // The window state is incoherent without a timestamp: fail closed.
        return { kind: 'locked' }
      }
      const endMs = Date.parse(endsAt)
      if (Number.isNaN(endMs)) return { kind: 'locked' }
      const msRemaining = endMs - now.getTime()
      if (msRemaining > 0) {
        return { kind: 'cooldown', endsAt, msRemaining }
      }
      return { kind: 'reset_pending' }
    }
    default:
      return { kind: 'locked' }
  }
}