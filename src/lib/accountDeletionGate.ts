// src/lib/accountDeletionGate.ts
// Access gate for the Ajustes deletion entry (feature: menu-ajustes, T3, S15).
//
// Pure on purpose: no React, no backend/client calls, no DOM, no clock reads.
// The caller injects `now`, so the gate is deterministic and unit-testable.
//
// S15 (owner decisions, verbatim): "Los primeros 10 días el usuario puede hacer
// sin pin. Pasados los 10 días, el usuario para borrar los datos tiene que
// poner el pin que ya tiene que haber configurado en el modo avanzado" and
// "ambas bajo la misma regla" — delete-data and delete-account share this rule.
// Owner revision (Log L10): "quiero llevar de 10 días a 15 días la opción del
// borrado de los datos y de la cuenta" — the grace window is now 15.
//
// Since the pi2 app-lock merge, the PIN source is the peer-owned single truth:
// useAppLock().lockState === 'activa' (AppLockContext). The gate stays PURE:
// callers pass the resolved boolean as `pinConfigured`. PIN_CONFIGURED_FALLBACK
// is kept exported only as a migration-era fallback for call sites that have
// not swapped to the context yet (the settings card has).
//
// Deletion is dangerous, so every unknown is fail-closed (locked).

/** S15 (owner revision L10) — days of use during which deletion needs no PIN. */
export const DAY_GRACE_WINDOW = 15

/**
 * S6/T5 legacy fallback — only for call sites not wired to AppLockContext yet.
 * The settings card now uses useAppLock().lockState === 'activa' instead.
 */
export const PIN_CONFIGURED_FALLBACK = false

/**
 * S15/T5 — the "borrar mis datos" RPC does not exist yet, so the option renders
 * disabled with a reason. Nothing deletes data on the client: this flag only
 * gates a row.
 */
export const DELETE_DATA_BACKEND_AVAILABLE = true

export type DeletionGateReason = 'pin_required' | 'unknown_signup'

export interface DeletionGateInput {
  /** `session.user.created_at` (auth signup date) — the only anchor available. */
  signupAt: string | null | undefined
  /** Whether the user has the security PIN configured in mode Avanzado. */
  pinConfigured: boolean
  /** Injected clock. */
  now: Date
}

export interface DeletionGateResult {
  locked: boolean
  /** null when the gate is open. */
  reason: DeletionGateReason | null
}

const DAY_MS = 86_400_000

/**
 * Day math: `elapsedDays = floor((now - signupAt) / 24h)` over the raw epoch
 * values. The gate stays open while `elapsedDays <= DAY_GRACE_WINDOW` and locks
 * as soon as `elapsedDays` reaches `DAY_GRACE_WINDOW + 1`.
 *
 * Documented simplification: we count whole 24h periods from the signup
 * timestamp instead of calendar days in the user's timezone, so right at the
 * boundary the gate can close up to ~1 day later than a local calendar-day
 * reading would. A signup stamp in the future (device clock skew) falls inside
 * the window, which is the same as a brand-new account.
 */
export function resolveDeletionGate({
  signupAt,
  pinConfigured,
  now,
}: DeletionGateInput): DeletionGateResult {
  const signupMs =
    typeof signupAt === 'string' && signupAt.trim() !== '' ? Date.parse(signupAt) : Number.NaN
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN
  if (!Number.isFinite(signupMs) || !Number.isFinite(nowMs)) {
    return { locked: true, reason: 'unknown_signup' }
  }
  const elapsedDays = Math.floor((nowMs - signupMs) / DAY_MS)
  if (elapsedDays <= DAY_GRACE_WINDOW) return { locked: false, reason: null }
  if (!pinConfigured) return { locked: true, reason: 'pin_required' }
  return { locked: false, reason: null }
}
