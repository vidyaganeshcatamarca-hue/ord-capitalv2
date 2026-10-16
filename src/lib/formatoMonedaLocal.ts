// lib/formatoMonedaLocal.ts
// ============================================
// Formato de la MONEDA LOCAL del usuario — pure logic, ZERO imports.
//
// The Node test runner imports this module directly with its type stripping
// (`import { ... } from '../../src/lib/formatoMonedaLocal.ts'`). Keep React,
// the DOM and Supabase out of here.
//
// Why this exists: Supervivencia had SEVEN local copies of formatMoneyARS()
// hardcoding 'ARS' + 'es-AR'. For a user whose local currency is EUR the
// module showed ARS symbols in their net worth (S19 breaks "queda en moneda
// local"). This is the single shared implementation: same formatting contract
// (Ints, maximumFractionDigits 0, es-AR fallback), but the currency and the
// locale are parameters now.
//
// Keep the es-AR default: every existing call site renders ARGENTINE pesos
// today, so a caller omitting both args must behave exactly like the old
// copies. Callers pass the user's real currency+locale (from useNumberFormat)
// to render their own local currency.

/**
 * Formats a whole-amount money string in the given currency/locale.
 * Collapses to the code (and never an invented symbol) when Intl has no data.
 */
export function formatMoneyLocal(
  v: number,
  localCurrency: string | null | undefined = 'ARS',
  locale: string | null | undefined = 'es-AR'
): string {
  const currency = String(localCurrency ?? 'ARS').trim().toUpperCase() || 'ARS'
  const tag = String(locale ?? 'es-AR').trim() || 'es-AR'
  try {
    return new Intl.NumberFormat(tag, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(v) ? v : 0)
  } catch {
    // Unknown currency or locale without ICU: honest fallback with the code.
    const sign = currency === 'ARS' ? '$' : ''
    return `${sign}${Math.round(Number.isFinite(v) ? v : 0).toLocaleString(tag)}`.trimStart()
  }
}