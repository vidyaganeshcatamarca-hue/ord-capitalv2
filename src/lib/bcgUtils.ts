// src/lib/bcgUtils.ts
// Helpers puros para el módulo BCG (ROI Emocional).
// 0% acoplamiento a Supabase / React / i18n. Fáciles de testear.

export type CuadranteKey = 'bcg_star' | 'bcg_cow' | 'bcg_dilemma' | 'bcg_dog'

export const BCG_CUADRANTES: Record<CuadranteKey, { emoji: string; labelKey: string; color: string }> = {
  bcg_star:    { emoji: '⭐', labelKey: 'bcg_cuadrante_star',    color: '#4ECDC4' },
  bcg_cow:     { emoji: '🐄', labelKey: 'bcg_cuadrante_cow',     color: '#6366F1' },
  bcg_dilemma: { emoji: '🤔', labelKey: 'bcg_cuadrante_dilemma', color: '#FFE66D' },
  bcg_dog:     { emoji: '🐕', labelKey: 'bcg_cuadrante_dog',     color: '#FF6B6B' },
}

/**
 * Devuelve el emoji + labelKey + color del cuadrante.
 * Si la clave no está en el set conocido, devuelve un fallback neutro.
 */
export function classifyCuadrante(key: string | null | undefined) {
  if (!key) return null
  return BCG_CUADRANTES[key as CuadranteKey] ?? null
}

/**
 * Umbral de frecuencia alta para la matriz ROI Emocional.
 * Coincide con la regla del backend: COUNT > 4 → "alta frecuencia".
 */
export const BCG_FRECUENCIA_ALTA = 4

/**
 * Umbral de placer alto para la matriz ROI Emocional.
 * Coincide con la regla del backend: utilidad_placer > 5.
 */
export const BCG_PLACER_ALTO = 5

/**
 * Formatea un número como moneda ARS (es-AR, sin decimales).
 * Puro: no depende de Intl del runtime del navegador.
 */
export function formatMoneyARS(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!isFinite(n)) return '$0'
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `$${Math.round(n).toLocaleString('es-AR')}`
  }
}

/**
 * Convierte un COUNT (bigint del backend) en radio SVG proporcional.
 * Devuelve un radio entre [min, max] pixeles.
 */
export function radiusFromMonto(monto: number | string, maxMonto: number, min = 6, max = 22): number {
  const m = Number(monto ?? 0)
  if (!isFinite(m) || m <= 0 || maxMonto <= 0) return min
  const ratio = Math.min(m / maxMonto, 1)
  return min + (max - min) * Math.sqrt(ratio)
}

/**
 * Calcula el dominio del eje X (frecuencia) para la matriz.
 * Siempre garantiza un mínimo de 8 para que los puntos no queden pegados al borde.
 */
export function dominioX(maxFrecuencia: number): number {
  return Math.max(8, Math.ceil(maxFrecuencia * 1.15))
}

/**
 * Etiqueta de mes corto en es-AR (ej: "May 2026").
 * Acepta Date o string YYYY-MM-DD.
 */
export function formatMesCorto(input: Date | string | null | undefined): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-AR', { month: 'short', year: 'numeric' }).format(d)
}

/**
 * Persistencia de la selección de mes en localStorage.
 */
const BCG_MES_KEY = 'bcg_mes_seleccionado'

export function getStoredMes(): string | null {
  try {
    return localStorage.getItem(BCG_MES_KEY)
  } catch {
    return null
  }
}

export function setStoredMes(mes: string | null) {
  try {
    if (mes) localStorage.setItem(BCG_MES_KEY, mes)
    else localStorage.removeItem(BCG_MES_KEY)
  } catch {
    // ignore
  }
}

/**
 * Equivalencias automáticas para la Podadora.
 * Devuelve la mejor frase equivalente según el ahorro anual proyectado.
 */
export interface Equivalencia {
  nombre: string
  umbral: number
  i18nKey: string
}

export const EQUIVALENCIAS_BCG: Equivalencia[] = [
  { nombre: 'iPhone',                 umbral: 1_500_000, i18nKey: 'bcg_podora_equiv_iphone' },
  { nombre: 'pasajes a Miami',        umbral:   800_000, i18nKey: 'bcg_podora_equiv_miami' },
  { nombre: 'meses de alquiler',      umbral:   300_000, i18nKey: 'bcg_podora_equiv_alquiler' },
  { nombre: 'meses de gimnasio',      umbral:    25_000, i18nKey: 'bcg_podora_equiv_gimnasio' },
  { nombre: 'cenas en restaurante',   umbral:    15_000, i18nKey: 'bcg_podora_equiv_cenas' },
]

/**
 * Elige la mejor equivalencia que sea <= ahorroAnual.
 * Si no hay ninguna, devuelve null.
 */
export function mejorEquivalencia(ahorroAnual: number): Equivalencia | null {
  if (ahorroAnual <= 0) return null
  return EQUIVALENCIAS_BCG
    .filter((eq) => ahorroAnual >= eq.umbral)
    .reduce<Equivalencia | null>(
      (best, eq) => eq.umbral > (best?.umbral ?? 0) ? eq : best,
      null
    )
}

/**
 * Tasa para calcular cuántos días antes se llega a una meta con un ahorro mensual.
 * Devuelve 0 si el ahorro es 0 o negativo.
 */
export function diasAntesMeta(metaFaltante: number, ahorroMensual: number): number {
  if (ahorroMensual <= 0) return 0
  const meses = metaFaltante / ahorroMensual
  return Math.max(0, Math.round(meses * 30))
}

/**
 * Tasa para calcular cuántos días extra gana el Escudo de Supervivencia.
 * Devuelve 0 si el burn rate es 0 o negativo.
 */
export function diasExtraEscudo(ahorroMensual: number, burnRateDiario: number): number {
  if (burnRateDiario <= 0) return 0
  return Math.max(0, Math.round(ahorroMensual / burnRateDiario))
}
