// lib/inversionesPatrimonio.ts
// ============================================
// Portfolio header for the Inversiones module — pure, ZERO imports.
//
// The Node test runner imports this module directly with its type stripping
// (`import { ... } from '../../src/lib/inversionesPatrimonio.ts'`). It cannot
// resolve Vite aliases (`@/...`) nor `.js`-to-`.ts` rewrites, so this file must
// stay free of every import. Keep React, the DOM and Supabase out of here.
//
// Why: the Inversiones header used to show a hardcoded "total ARS" plus a
// hardcoded "USD" line, both fiction: the backend summed every currency
// together and the frontend passed p_cotizacion_usd = 1, so the USD number was
// a copy of the ARS one. The owner's rule (S3): "un total en la moneda local +
// un subtotal por monedas" — the same shape the Home hero already uses
// (patrimonioHero.buildHeroLines): the big number is the LOCAL bucket, and
// every other currency gets one sub-line with its own total, no cross
// conversion, nothing hardcoded.
//
// The backend contract (fn_reporte_patrimonio_inversiones, jsonb):
//   {moneda_local, total_moneda_local, totales_por_moneda:[{moneda,total}],
//    monedas_sin_cotizacion:[...]}
// monedas_sin_cotizacion lists currencies the user holds that have no rate in
// p_divisas: they CANNOT be converted, so they are shown as their own line
// (honest) and never silently folded into the local total.

/** One portfolio sub-line: a currency and its total in its own units. */
export interface PortfolioLine {
  moneda: string
  total: number
}

/** The totales_por_moneda row as PostgREST delivers it. */
export interface PortfolioTotalRow {
  moneda?: string | null
  total?: number | string | null
}

/** The jsonb the RPC returns, already normalized by the caller. */
export interface PortfolioPatrimonio {
  moneda_local: string
  total_moneda_local: number
  totales_por_moneda: PortfolioTotalRow[]
  monedas_sin_cotizacion: string[]
}

/**
 * Sub-lines: every currency the user holds with a non-zero total, in the RPC's
 * order, EXCLUDING the local currency (it IS the big number).
 *
 * Rules (same spirit as the Home hero, no invention):
 *  - the local row never appears as a sub-line;
 *  - a zero total adds no line (nothing to show);
 *  - a negative total DOES appear (a loss is information);
 *  - a currency without a rate (monedas_sin_cotizacion) still appears with its
 *    own total, because hiding it would understate what the user holds;
 *  - a currency with no row at all is not invented.
 */
export function buildPortfolioLines(
  localCurrency: string | null | undefined,
  totalesPorMoneda: PortfolioTotalRow[] | null | undefined,
  monedasSinCotizacion: readonly (string | null)[] = []
): PortfolioLine[] {
  const local = String(localCurrency ?? '').trim().toUpperCase()
  const rows = Array.isArray(totalesPorMoneda) ? totalesPorMoneda : []

  const byMoneda = new Map<string, number>()
  for (const row of rows) {
    const moneda = String(row?.moneda ?? '').trim().toUpperCase()
    const total = Number(row?.total)
    if (!moneda || !Number.isFinite(total)) continue
    byMoneda.set(moneda, total)
  }

  // Currencies the user holds but that cannot be converted: they are real
  // holdings, so they get a line even if the RPC did not repeat them.
  const sinCotizacion = Array.isArray(monedasSinCotizacion) ? monedasSinCotizacion : []
  for (const raw of sinCotizacion) {
    const moneda = String(raw ?? '').trim().toUpperCase()
    if (!moneda || moneda === local || byMoneda.has(moneda)) continue
    byMoneda.set(moneda, 0)
  }

  const out: PortfolioLine[] = []
  for (const [moneda, total] of byMoneda) {
    if (moneda === local) continue
    if (total === 0 && !sinCotizacion.some((m) => String(m ?? '').trim().toUpperCase() === moneda)) {
      continue
    }
    out.push({ moneda, total })
  }
  return out
}

/**
 * The local-currency total to headline. Falls back to the local row of
 * totales_por_moneda when the RPC did not compute it (never to a hardcoded
 * currency): a user whose local bucket is USD gets USD.
 */
export function resolveTotalLocal(
  localCurrency: string | null | undefined,
  totalMonedaLocal: number | null | undefined,
  totalesPorMoneda: PortfolioTotalRow[] | null | undefined
): number {
  // null/undefined = "el RPC no lo calculó" → buscar la fila local.
  // Un 0 explícito SÍ es un valor (cartera vacía) y se respeta.
  if (totalMonedaLocal !== null && totalMonedaLocal !== undefined) {
    const total = Number(totalMonedaLocal)
    if (Number.isFinite(total)) return total
  }

  const local = String(localCurrency ?? '').trim().toUpperCase()
  const rows = Array.isArray(totalesPorMoneda) ? totalesPorMoneda : []
  for (const row of rows) {
    const moneda = String(row?.moneda ?? '').trim().toUpperCase()
    if (moneda === local) {
      const value = Number(row?.total)
      if (Number.isFinite(value)) return value
    }
  }
  return 0
}
/**
 * Ganancia de UNA inversión, en su propia moneda: valor actual menos capital.
 *
 * Dueño, 2026-10-23: "la ganancia aparece mal en número, no está haciendo bien la
 * resta, sino que está mostrando el porcentaje, pero lo muestra como número. Ahí
 * debe mostrar la ganancia en número, no el porcentaje."
 *
 * La tarjeta le pasaba `rendimiento_nominal` (un porcentaje: 20, -30) a
 * `formatCurrency`, así que se veía `+R$ 20,00` donde la ganancia real era 500.
 *
 * Se calcula con los dos números que la propia tarjeta ya muestra (capital
 * original y valor actual), así que la resta que se ve en pantalla es la misma
 * que se informa. El porcentaje sigue viviendo en su propio campo
 * (`rendimiento_nominal`) y se sigue mostrando como porcentaje en el detalle.
 */
export function investmentGainAmount(
  inversion:
    | {
        monto_invertido_original?: number | string | null
        valor_actual_teorico?: number | string | null
      }
    | null
    | undefined
): number | null {
  if (!inversion) return null
  const capital = inversion.monto_invertido_original
  const actual = inversion.valor_actual_teorico
  if (capital === null || capital === undefined) return null
  if (actual === null || actual === undefined) return null

  const capitalNum = typeof capital === 'string' ? Number.parseFloat(capital) : Number(capital)
  const actualNum = typeof actual === 'string' ? Number.parseFloat(actual) : Number(actual)
  if (!Number.isFinite(capitalNum) || !Number.isFinite(actualNum)) return null

  return Math.round((actualNum - capitalNum) * 100) / 100
}
