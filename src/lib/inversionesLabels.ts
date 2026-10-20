// lib/inversionesLabels.ts
// ============================================
// Movement labels of the Inversiones module — pure, ZERO imports.
//
// The Node test runner imports this module directly with its type stripping
// (`import { ... } from '../../src/lib/inversionesLabels.ts'`). It cannot
// resolve Vite aliases (`@/...`) nor `.js`-to-`.ts` rewrites, so this file must
// stay free of every import. Keep React, the DOM and Supabase out of here.
//
// Why: the backend writes the `detalle` of an investment movement as a
// 'key: value' pair — 'investment_prefix: Bitcoin', 'liquidation_gain: GGAL',
// 'liquidation_loss: GGAL', 'liquidation_capital_recovery: GGAL',
// 'rescate_inversion: GGAL'. The app rendered those raw: the user saw
// 'liquidation_gain: GGAL' in the movement list of the wallet AND in the
// investment detail. Every surface that shows a movement title must resolve
// the key through t() and keep only the free-text part.
//
// The key is stable and translatable; the value is the user's own asset name
// and must NEVER be translated. A detalle that is not a known key (older
// movement, or a plain category) is returned untouched — no invention.

/** The known movement keys the backend writes for investments. */
export const INVERSION_MOVEMENT_KEYS = [
  'investment_prefix',
  'liquidation_capital_recovery',
  'liquidation_gain',
  'liquidation_loss',
  'rescate_inversion',
] as const

export type InversionMovementKey = (typeof INVERSION_MOVEMENT_KEYS)[number]

/**
 * Split a backend detalle into its i18n key and its free-text value.
 * Returns null when the detalle is not a known investment movement key.
 */
export function splitInversionDetalle(
  detalle: string | null | undefined
): { key: InversionMovementKey; value: string } | null {
  const raw = String(detalle ?? '').trim()
  if (!raw) return null

  const sep = raw.indexOf(':')
  if (sep <= 0) return null

  const key = raw.slice(0, sep).trim()
  const value = raw.slice(sep + 1).trim()

  if (!(INVERSION_MOVEMENT_KEYS as readonly string[]).includes(key)) return null
  if (!value) return null

  return { key: key as InversionMovementKey, value }
}

/**
 * Render an investment movement detalle.
 *
 * Known key  -> t(key) with the free-text value appended, so the user reads
 *               "Recuperación de capital: GGAL" and never a raw key.
 * Unknown     -> the detalle untouched (it is a plain category, not ours).
 */
export function formatInversionDetalle(
  detalle: string | null | undefined,
  translate: (key: string) => string
): string {
  const raw = String(detalle ?? '').trim()
  if (!raw) return ''

  const parsed = splitInversionDetalle(raw)
  if (!parsed) return raw

  const label = translate(parsed.key)
  if (!label) return raw
  return `${label}: ${parsed.value}`
}