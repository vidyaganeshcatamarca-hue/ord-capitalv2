// Referencia de la barra de un sobre hijo.
//
// Dueño (2026-11-11): un hijo SIN asignación se medía contra cero, así que
// `getPctBarra(gastado, 0)` devolvía 100 y la barra salía siempre llena y roja contra
// un techo que no existía. Su regla: «comparemos el gasto del hijo que no tiene
// asignación contra la asignación del padre. Si la tiene, entonces ahí sí podemos
// dibujar la barra».
//
// Tres casos, en este orden:
//
//   1. Tiene asignación propia  -> se mide contra la suya.
//   2. Sin asignación, con padre que tiene asignación y libre disponible
//      -> se mide contra el libre del grupo.
//   3. Sin techo en ninguno de los dos -> no hay barra que dibujar.
//
// Denominador ÚNICO para los hijos sin asignación: no se reparte el libre en partes
// iguales entre ellos, porque eso inventaría un reparto que nadie decidió. Cada barra
// informa cuánto del libre se comió ese hijo, y si dos van al 60% el grupo está
// desbordado: eso es lo que tiene que mostrar.

export type OrigenTecho = 'propia' | 'libre_padre' | 'sin_techo' | 'techo'
export type ColorBarra = 'verde' | 'amarillo' | 'rojo'

export interface ReferenciaBarra {
  /** Techo contra el que se dibuja la barra. Cero cuando no hay techo. */
  techo: number
  origen: OrigenTecho
}

/** Mismo corte que usa el servidor para `estado_sobre`: 70% amarillo, pasado el techo rojo. */
const UMBRAL_AMARILLO = 0.7

export function referenciaBarraHija(args: {
  montoAsignado: number | null | undefined
  libreGrupo: number | null | undefined
}): ReferenciaBarra {
  const asignado = Number(args.montoAsignado ?? 0)
  if (asignado > 0) return { techo: asignado, origen: 'propia' }

  const libre = Number(args.libreGrupo ?? 0)
  if (libre > 0) return { techo: libre, origen: 'libre_padre' }

  return { techo: 0, origen: 'sin_techo' }
}

/**
 * Porcentaje de la barra, o `null` cuando no hay techo que comparar.
 * El `null` no es un cero: es la señal de que la barra no se dibuja.
 */
export function porcentajeBarra(gastado: number, techo: number): number | null {
  if (!(techo > 0)) return null
  const g = Math.max(Number(gastado) || 0, 0)
  return Math.min(Math.round((g / techo) * 100), 100)
}

/** Color de la barra, o `null` cuando no hay techo. */
export function colorDeBarra(gastado: number, techo: number): ColorBarra | null {
  if (!(techo > 0)) return null
  const g = Number(gastado) || 0
  if (g <= techo * UMBRAL_AMARILLO) return 'verde'
  if (g <= techo) return 'amarillo'
  return 'rojo'
}

/**
 * Referencia de la barra con el techo del modelo A.
 *
 * Dueño (2026-11-11): el techo dice lo que se puede gastar y la plata cuánto se asignó;
 * son dos cosas distintas. La barra y el rojo se miden contra el TECHO.
 *
 * Precedencia: techo propio > plata propia > libre del padre > sin barra.
 * Un techo `null` es SIN tope, no un tope de cero: si la fila igual tiene plata propia se
 * sigue midiendo contra su plata, que es la lectura vieja y sigue siendo útil.
 */
export function referenciaBarraDeSobre(args: {
  techo: number | null | undefined
  montoAsignado: number | null | undefined
  libreGrupo: number | null | undefined
}): ReferenciaBarra {
  const techo = args.techo === null || args.techo === undefined ? null : Number(args.techo)
  if (techo !== null && techo > 0) return { techo, origen: 'techo' }
  return referenciaBarraHija({ montoAsignado: args.montoAsignado, libreGrupo: args.libreGrupo })
}

/**
 * Avance contra el techo, SIN tope.
 *
 * Dueño (2026-11-11): «cuando me paso de la barra, la barra se pinta completa y el número
 * indica el porcentaje en el que me pasé». O sea: el relleno se corta en el ancho, el
 * número no. 150 significa que se pasó un 50% de su cuota.
 */
export function porcentajeAvance(gastado: number, techo: number): number | null {
  if (!(techo > 0)) return null
  const g = Math.max(Number(gastado) || 0, 0)
  return Math.round((g / techo) * 100)
}

/**
 * Cuánto del pozo del padre consumió esta fila, en porcentaje del pozo.
 *
 * Dueño: «lo que comió ese hijo en relación a lo que el padre tenía disponible». Es
 * consumo INDIVIDUAL: dos hijos pueden mostrar 30% cada uno y sumar 60% del mismo pozo,
 * y eso es correcto porque no es saldo restante. El tope en 100 es sólo del relleno.
 */
export function porcentajeDelPozo(gastado: number, pozoDelPadre: number): number | null {
  if (!(pozoDelPadre > 0)) return null
  const g = Math.max(Number(gastado) || 0, 0)
  return Math.min(Math.round((g / pozoDelPadre) * 100), 100)
}
