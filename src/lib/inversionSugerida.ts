// Valor sugerido de un plazo fijo por tiempo transcurrido.
//
// Dueño (ronda 10, S10): "¿no debería esa inversión ir diciéndome cuánto está haciendo el
// rendimiento de acuerdo al tiempo transcurrido?" Y al elegir: "Solo monto sugerido por el
// cálculo, no hay edición".
//
// O sea: la app muestra el número que sale de la cuenta y no se toca a mano. Es una
// SUGERENCIA, no un valor contable: lo que pague el banco manda.
//
// Interés simple con año de 365 días, que es la convención de los plazos fijos argentinos
// cuando la tasa es TNA (tasa nominal anual) y no hay capitalización.

export interface SugerenciaPlazoFijo {
  /** Valor de hoy del capital según la tasa y los días transcurridos. */
  valorSugerido: number
  /** Cuánto de ese valor es rendimiento, no capital. */
  rendimiento: number
  /** Días que se usaron para la cuenta. */
  dias: number
}

/**
 * Devuelve `null` cuando no hay nada que sugerir: sin tasa, sin capital o sin días
 * transcurridos. Nunca inventa un cero, porque un cero se lee como "no rindió".
 */
export function valorSugeridoPlazoFijo(args: {
  capital: number | null | undefined
  tasaAnualPorcentaje: number | null | undefined
  dias: number | null | undefined
}): SugerenciaPlazoFijo | null {
  const capital = Number(args.capital ?? 0)
  const tasa = Number(args.tasaAnualPorcentaje ?? 0)
  const dias = Number(args.dias ?? 0)
  if (!(capital > 0) || !(tasa > 0) || !(dias > 0)) return null
  const rendimiento = capital * (tasa / 100) * (dias / 365)
  return {
    valorSugerido: capital + rendimiento,
    rendimiento,
    dias,
  }
}
