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
