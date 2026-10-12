// lib/regionSnapshot.ts
// ============================================
// Typed local snapshots of the user's region and number-format preferences.
//
// The pure envelope logic lives in `userSnapshot.ts` (tested). This module is
// the thin adapter that knows the keys, the shapes and the browser storage.
//
// IMPORTANT — why `confirmado` is NOT used here to decide whether a region is
// usable: the ~63 users that existed before the onboarding country step all have
// `confirmado_at = NULL` because they never went through it, yet their region row
// carries a real country and currency. Gating display on `confirmado` would blank
// their formatting. `confirmado` decides whether to SHOW the country step, not
// which currency to format with.

import { clearSnapshot, isPlainObject, readSnapshot, writeSnapshot } from './userSnapshot'
import type { SnapshotStorage } from './userSnapshot'

export const REGION_SNAPSHOT_KEY = 'ord_region_snapshot_v1'
export const PREFS_SNAPSHOT_KEY = 'ord_prefs_snapshot_v1'

export interface RegionSnapshot {
  countryCode: string
  localCurrency: string
  language: string
}

export interface PrefsSnapshot {
  decimales_moneda_local: number
  decimales_segunda_moneda: number
  separador_miles: string
  separador_decimal: string
}

function browserStorage(): SnapshotStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Accessing localStorage itself can throw in some privacy modes.
    return null
  }
}

const isRegionSnapshot = (value: unknown): value is RegionSnapshot =>
  isPlainObject(value) &&
  typeof value.countryCode === 'string' &&
  typeof value.localCurrency === 'string' &&
  typeof value.language === 'string'

const isPrefsSnapshot = (value: unknown): value is PrefsSnapshot =>
  isPlainObject(value) &&
  typeof value.decimales_moneda_local === 'number' &&
  typeof value.decimales_segunda_moneda === 'number' &&
  typeof value.separador_miles === 'string' &&
  typeof value.separador_decimal === 'string'

export function readRegionSnapshot(userId: string | null | undefined): RegionSnapshot | null {
  return readSnapshot(browserStorage(), REGION_SNAPSHOT_KEY, userId, isRegionSnapshot)
}

/**
 * Stores a region only when it is a usable one. An empty country or currency
 * means "the user has not chosen yet", and caching that would resurrect the
 * silent Argentine default this whole work exists to remove.
 */
export function writeRegionSnapshot(
  userId: string | null | undefined,
  region: RegionSnapshot | null | undefined
): void {
  if (!region || !region.countryCode || !region.localCurrency) return
  writeSnapshot(browserStorage(), REGION_SNAPSHOT_KEY, userId, region)
}

export function readPrefsSnapshot(userId: string | null | undefined): PrefsSnapshot | null {
  return readSnapshot(browserStorage(), PREFS_SNAPSHOT_KEY, userId, isPrefsSnapshot)
}

export function writePrefsSnapshot(
  userId: string | null | undefined,
  prefs: PrefsSnapshot | null | undefined
): void {
  if (!prefs) return
  writeSnapshot(browserStorage(), PREFS_SNAPSHOT_KEY, userId, prefs)
}

/**
 * Drops the cached formats. Needed whenever the server re-derives them (a country
 * change), because the local copy would otherwise keep the previous country's
 * decimals until the next full reload.
 */
export function clearPrefsSnapshot(): void {
  clearSnapshot(browserStorage(), PREFS_SNAPSHOT_KEY)
}

/** Drops both snapshots. Called on sign-out so the next user starts clean. */
export function clearUserSnapshots(): void {
  const storage = browserStorage()
  clearSnapshot(storage, REGION_SNAPSHOT_KEY)
  clearSnapshot(storage, PREFS_SNAPSHOT_KEY)
}
