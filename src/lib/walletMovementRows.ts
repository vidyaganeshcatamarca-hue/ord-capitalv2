// src/lib/walletMovementRows.ts
// Pure row math for the wallet detail sheet ("Últimos Movimientos").
// ZERO imports: the Node test runner imports this file directly with its type
// stripping (same convention as transferTitles.ts).
//
// Owner bug (tanda 4): the rows rendered "+-" / "--" and the raw `tipo`
// ('income' / 'expense') because the component read `valor_egreso` /
// `valor_ingreso` / `nombre_cuenta_historico` — fields that
// fn_reporte_movimientos_por_billetera does NOT return. Its contract is
// (p_caja_id, fecha, tipo, monto SIGNED, nombre_categoria, icono_categoria,
// color_categoria, detalle, es_compartido, billetera_contraria).
//
// So: the amount comes from `monto` (already signed by the server) and the
// title from `nombre_categoria`. Nothing here guesses a currency.

/** Signed amount the server already oriented for this wallet. */
export function movementAmount(row: { monto?: number | string | null } | null | undefined): number {
  const raw = row?.monto
  const value = typeof raw === 'number' ? raw : Number(raw ?? 0)
  return Number.isFinite(value) ? Math.abs(value) : 0
}

/** '+' for money in, '-' for money out, '' for a no-op row. */
export function movementSign(row: { monto?: number | string | null } | null | undefined): '+' | '-' | '' {
  const raw = row?.monto
  const value = typeof raw === 'number' ? raw : Number(raw ?? 0)
  if (!Number.isFinite(value) || value === 0) return ''
  return value < 0 ? '-' : '+'
}

/** True when the row took money out of this wallet. */
export function movementIsOutflow(row: { monto?: number | string | null } | null | undefined): boolean {
  return movementSign(row) === '-'
}

/** Generic buckets a category CASE can produce when the real label lives in `detalle`. */
const GENERIC_CATEGORIES = new Set(['', 'no_category', 'no_detail', 'type_transfer'])

/**
 * Which string the row must render as its title.
 *
 * Owner bug (tanda 5): fn_reporte_movimientos_por_billetera builds
 * `nombre_categoria` as COALESCE(category, tipo CASE) and never inspects
 * `detalle`, so cross-currency transfers arrive as 'no_category' even though
 * the movement carries its real label as a JSON payload, and openings as
 * 'initial_balance'. A specific detalle wins over a generic bucket; a real
 * category always wins over the detalle.
 */
export function movementTitleSource(
  row: { nombre_categoria?: string | null; detalle?: string | null } | null | undefined,
): string {
  const category = String(row?.nombre_categoria ?? '').trim()
  const detalle = String(row?.detalle ?? '').trim()
  const isPayload = detalle.startsWith('{')
  if (isPayload) return detalle
  if (GENERIC_CATEGORIES.has(category) && detalle) return detalle
  return category
}
