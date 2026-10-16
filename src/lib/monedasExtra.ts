// lib/monedasExtra.ts
// ============================================
// Derivation of the user's wallet-currency options — pure logic, ZERO imports.
//
// The Node test runner imports this module directly with its type stripping
// (`import { ... } from '../../src/lib/monedasExtra.ts'`). It cannot resolve
// Vite aliases (`@/...`) nor `.js`-to-`.ts` rewrites, so this file must stay
// free of every import. Keep React, the DOM and Supabase out of here.
//
// Why this module exists: the wallet picker used to hardcode the pair
// [local, 'USD'] (BilleterasPage derive), which froze the second currency.
// With "monedas extra libres" (T1: fn_obtener_monedas_extra), the user's
// currency set is DATA: local currency plus up to 2 configured extras. The
// backend enforces the catalog/limit rules (S5/S9, fn_configurar_monedas_extra);
// this function only builds the honest list for the UI.
//
// Order is presentation, not semantics: the local currency first (it is what a
// user scans for), then the extras in the order the user configured them.

/**
 * Uppercases, trims and validates an ISO-ish currency code; '' for unusable ones.
 */
function normalize(code: unknown): string {
  if (code == null) return ''
  return String(code).trim().toUpperCase()
}

/**
 * The wallet-currency options for the picker: local currency first, then the
 * configured extras (deduped, normalized, without ever repeating the local).
 *
 * A missing local currency is not an error state the function hides: it just
 * returns the extras — the caller decides what an unusable empty list means
 * (the region RPC failed, no region confirmed, ...). Nothing is invented.
 */
export function buildWalletCurrencyOptions(
  localCurrency: string | null | undefined,
  extras: readonly (string | null)[] | null | undefined
): string[] {
  const local = normalize(localCurrency)
  const out: string[] = []
  const seen = new Set<string>()

  if (local) {
    out.push(local)
    seen.add(local)
  }

  const extraList = Array.isArray(extras) ? extras : []
  for (const raw of extraList) {
    const code = normalize(raw)
    if (code && !seen.has(code)) {
      out.push(code)
      seen.add(code)
    }
  }

  return out
}