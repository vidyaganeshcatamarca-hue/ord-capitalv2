// lib/patrimonioHero.ts
// ============================================
// Hero net-worth lines for the user's currency set — pure, ZERO imports.
//
// The Node test runner imports this module directly with its type stripping
// (`import { ... } from '../../src/lib/patrimonioHero.ts'`). It cannot resolve
// Vite aliases (`@/...`) nor `.js`-to-`.ts` rewrites, so this file must stay
// free of every import. Keep React, the DOM and Supabase out of here.
//
// Why: the Home hero used to hard-draw ONE USD line from total_dolares — the
// second currency nailed to dollars. With "monedas extra libres" (S18, decided
// with the owner: "como hoy: bucket local + líneas"), the big number stays the
// local bucket (total_pesos, no consolidated total) and the sub-line becomes
// one row per non-local currency WITH a non-zero total, sourced from the RPC's
// existing totales_por_moneda ({moneda,total}[]) shape. No creation, no merge:
// only honest filtering.
//
// Order mirrors what the RPC already returns (local first, then the rest
// alphabetically) — the "extras first, then orphans" nuance belongs to the
// caller IF it wants it; this helper preserves the RPC order and simply drops
// the local row and zero rows. Simplest contract that cannot lie.

/** One hero sub-line: a currency and its total in its own units. */
export interface HeroLine {
  moneda: string
  total: number
}

/** The totales_por_moneda row as PostgREST delivers it. */
export interface TotalPorMoneda {
  moneda?: string | null
  total?: number | string | null
}

/**
 * Hero sub-lines: every non-local currency with a non-zero total, in the RPC's
 * existing order. Local never appears (it IS the big number); zero rows never
 * appear (owner's rule: a currency with nothing to show adds no line); a
 * negative total DOES appear (a red account is information).
 */
export function buildHeroLines(
  localCurrency: string | null | undefined,
  totalesPorMoneda: TotalPorMoneda[] | null | undefined,
  extras: readonly (string | null)[] | null | undefined = []
): HeroLine[] {
  const local = String(localCurrency ?? '').trim().toUpperCase()
  const rows = Array.isArray(totalesPorMoneda) ? totalesPorMoneda : []

  // Index the RPC rows once; duplicate moneda rows never lie (last value wins).
  const byMoneda = new Map<string, number>()
  for (const row of rows) {
    const moneda = String(row?.moneda ?? '').trim().toUpperCase()
    const total = Number(row?.total)
    if (!moneda || !Number.isFinite(total)) continue
    byMoneda.set(moneda, total)
  }

  const out: HeroLine[] = []
  const used = new Set<string>()

  // 1) El set del usuario (extras en su orden de config; default USD primero).
  const extraList = Array.isArray(extras) ? extras : []
  for (const raw of extraList) {
    const moneda = String(raw ?? '').trim().toUpperCase()
    if (!moneda || moneda === local || used.has(moneda)) continue
    const total = byMoneda.get(moneda)
    if (total === undefined) continue  // no wallet in that currency: no line
    if (total === 0) continue          // cero: sin línea (decisión del dueño)
    used.add(moneda)
    out.push({ moneda, total })
  }

  // 2) Cualquier otra moneda con saldo no nulo (billeteras huérfanas viejas).
  for (const [moneda, total] of byMoneda) {
    if (moneda === local || used.has(moneda)) continue
    if (total === 0) continue
    used.add(moneda)
    out.push({ moneda, total })
  }

  return out
}