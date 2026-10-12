// lib/userSnapshot.ts
// ============================================
// Per-user local snapshots — pure logic, ZERO imports.
//
// Why this exists: the region and the number-format preferences come from RPCs,
// so the first paint of every screen that shows an amount renders a placeholder
// (`-`) until they resolve. Those values change rarely, so the last known answer
// is kept in localStorage and used for the first render, while the RPC refreshes
// it in the background.
//
// Three rules, all of them learned the hard way:
//   1. Always tagged with the user id. Without it, on a shared device the next
//      user sees the previous user's currency until the RPC lands.
//   2. The caller decides what is cacheable. A region that was never confirmed
//      by a human must not be stored as if it had been.
//   3. Every write path needs a matching invalidation path, sign-out included.
//
// `storage` is injected instead of read from `window` so this stays pure and
// testable with a fake implementation.

export interface SnapshotStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface SnapshotEnvelope<T> {
  userId: string
  version: number
  value: T
}

const VERSION = 1

/**
 * Reads the snapshot only when it belongs to the given user and passes the
 * caller's validator. Anything unexpected (other user, older shape, corrupt
 * JSON, blocked storage) resolves to null so the caller falls back to the RPC.
 */
export function readSnapshot<T>(
  storage: SnapshotStorage | null | undefined,
  key: string,
  userId: string | null | undefined,
  isValid: (value: unknown) => value is T
): T | null {
  if (!storage || !userId) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SnapshotEnvelope<unknown>
    if (!parsed || parsed.version !== VERSION) return null
    if (parsed.userId !== userId) return null
    return isValid(parsed.value) ? parsed.value : null
  } catch {
    return null
  }
}

/** Stores the value for this user. Never throws: a full or blocked storage must not break the UI. */
export function writeSnapshot<T>(
  storage: SnapshotStorage | null | undefined,
  key: string,
  userId: string | null | undefined,
  value: T
): void {
  if (!storage || !userId) return
  try {
    const envelope: SnapshotEnvelope<T> = { userId, version: VERSION, value }
    storage.setItem(key, JSON.stringify(envelope))
  } catch {
    // Storage quota or private mode: the app keeps working from the RPC.
  }
}

/** Drops the snapshot regardless of who it belonged to (used on sign-out). */
export function clearSnapshot(
  storage: SnapshotStorage | null | undefined,
  key: string
): void {
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // Same as writeSnapshot.
  }
}

/** Small helper so callers do not hand-roll the "is this object usable" check. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
