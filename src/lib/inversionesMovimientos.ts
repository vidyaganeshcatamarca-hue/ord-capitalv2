/**
 * Signo del historial de movimientos de UNA inversión.
 *
 * `fn_reporte_detalle_inversion` arma el historial desde `p_caja`, y ahí el signo
 * está puesto desde la perspectiva de la CAJA (el bolsillo):
 *
 *   - aportar a la inversión  -> `expense` -> monto NEGATIVO (la plata sale)
 *   - rescatar de la inversión -> `income`  -> monto POSITIVO (la plata vuelve)
 *
 * El historial que se muestra en el detalle es el de LA INVERSIÓN, así que la
 * perspectiva se invierte: lo que entra a la inversión suma, lo que sale resta.
 *
 * Dueño, 2026-10-23: "lo que está con signo menos es lo que agregamos a la
 * inversión por lo tanto tiene que estar en positivo y en verde y lo que está en
 * verde tiene que estar en negativo y en rojo porque es lo que sacamos o lo que
 * perdimos".
 *
 * Se corrige acá y no en el SQL a propósito: el RPC sigue devolviendo el espejo de
 * `p_caja` (que es correcto para la caja) y el que interpreta la perspectiva es el
 * consumidor. Así no hace falta migrar la base para arreglar una pantalla.
 */
export function investmentMovementAmount(
  monto: number | string | null | undefined
): number | null {
  if (monto === null || monto === undefined) return null
  const value = typeof monto === 'string' ? Number.parseFloat(monto) : Number(monto)
  if (Number.isNaN(value)) return null
  // `-0` no aporta nada y confunde: se normaliza a 0.
  return -value === 0 ? 0 : -value
}
