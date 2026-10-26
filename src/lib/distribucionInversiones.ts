/**
 * Modo de la pestaña Gráfico: una porción por inversión o, si el backend todavía
 * no está migrado, agrupado por tipo de activo.
 *
 * Dueño, 2026-10-24 (S6): "Tienes que distribuir por cada una de las inversiones
 * que tenemos. Si tengo cinco inversiones, muestro las cinco inversiones con sus
 * diferentes porcentajes. [...] No mostramos la distribución por tipo variable o
 * plazo fijo. Eso está mal."
 *
 * El agrupamiento real vive en `fn_reporte_distribucion_activos` (migración 91), y
 * esa función la publica PI1 cuando el dueño lo indique. Por eso el front no puede
 * asumir que ya está: si las filas no traen `nombre_activo`, agrupa por tipo como
 * antes en vez de mostrar una lista vacía o sin nombre. Así el orden de despliegue
 * (front primero o SQL primero) no rompe la pantalla.
 */

export interface DistribucionRow {
  // Opcionales a propósito: el backend sin migrar no manda estos campos, y la
  // fila vieja tiene que poder clasificarse igual.
  inversion_id?: number | null
  nombre_activo?: string | null
  // S6b (2026-10-24): valor en la moneda propia de la inversión. Es lo que se
  // MUESTRA. `valor_total` (moneda local) queda solo como vara común del %.
  valor_propio?: number | null
  moneda?: string | null
  tipo_activo: string
  cantidad: number
  valor_total: number
  porcentaje_valor: number
}

export type DistribucionModo = 'inversion' | 'tipo'

export interface DistribucionClasificada {
  modo: DistribucionModo
  filas: DistribucionRow[]
}

const nombre = (row: DistribucionRow): string =>
  typeof row.nombre_activo === 'string' ? row.nombre_activo.trim() : ''

export function clasificarDistribucion(rows: DistribucionRow[]): DistribucionClasificada {
  const filas = Array.isArray(rows) ? rows : []
  if (filas.length === 0) return { modo: 'inversion', filas: [] }

  // Con nombre en todas las filas, el backend ya devuelve una por inversión.
  if (filas.every((row) => nombre(row) !== '')) {
    return { modo: 'inversion', filas }
  }

  // Backend viejo (o fila suelta sin nombre): agrupado por tipo, como antes.
  const porTipo = new Map<string, DistribucionRow>()
  for (const row of filas) {
    const tipo = row.tipo_activo || 'otro'
    const previa = porTipo.get(tipo)
    if (previa) {
      previa.cantidad += row.cantidad || 1
      previa.valor_total += row.valor_total
      previa.porcentaje_valor += row.porcentaje_valor
    } else {
      porTipo.set(tipo, {
        inversion_id: null,
        nombre_activo: null,
        // Dueño, 2026-10-24: "no puedes sumar moneda local con otra moneda". Al
        // agrupar por tipo se juntan inversiones que pueden estar en monedas
        // distintas, así que se descarta el valor propio y la tabla cae al
        // equivalente en moneda local, que es la única vara comparable.
        valor_propio: null,
        moneda: null,
        tipo_activo: tipo,
        cantidad: row.cantidad || 1,
        valor_total: row.valor_total,
        porcentaje_valor: row.porcentaje_valor,
      })
    }
  }

  const agrupadas = [...porTipo.values()].sort((a, b) => b.valor_total - a.valor_total)
  for (const fila of agrupadas) {
    fila.porcentaje_valor = Math.round(fila.porcentaje_valor * 100) / 100
  }
  return { modo: 'tipo', filas: agrupadas }
}

/**
 * ¿Corresponde mostrar el equivalente en moneda local entre paréntesis?
 *
 * S4 (ronda 5, dueño): "solo debes mostrar este valor a las inversiones que no son en
 * moneda local. Las que son en moneda local no tienes que mostrar nada en este campo
 * porque ya está mostrado en el campo anterior."
 *
 * Si falta cualquiera de las dos monedas se muestra igual: esconder un dato por falta de
 * información es peor que repetirlo.
 */
export function mostrarEquivalenteLocal(
  moneda: string | null | undefined,
  monedaLocal: string | null | undefined
): boolean {
  const propia = String(moneda ?? '').trim().toUpperCase()
  const local = String(monedaLocal ?? '').trim().toUpperCase()
  if (!propia || !local) return true
  return propia !== local
}
