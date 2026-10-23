// lib/format.ts
// ============================================
// Shared formatting helpers used by ~22 files.
import { parseCalendarDate } from './parseCalendarDate.ts'
//
// Everything here used to be nailed to Argentina: the locale was `'es-AR'`, the
// decimals were always 0 (so a euro amount lost its cents) and the default currency
// was `'ARS'`. A user in Spain formatted their money with Argentine rules.
//
// The context is published by `useNumberFormat` (which is where the region and the
// format preferences are resolved) and read here. A module-level value is what lets a
// plain function stay callable from anywhere, the same trade-off the translator makes
// with its current language.
//
// The defaults below reproduce the previous behaviour exactly, so nothing changes until
// the user's region is known.

export interface FormatContext {
  /** BCP-47 locale for `Intl`, built from the user's language and country. */
  locale: string
  localCurrency: string
  decimalsLocal: number
  decimalsSecondary: number
  /** Separador decimal elegido en la configuración regional (por defecto ','). */
  decimalSeparator: string
  /**
   * Formato por moneda, resuelto por `fn_obtener_formato_moneda()`.
   *
   * El dueño definió la regla: cada moneda usa SU formato elegido (separadores
   * y decimales), y los valores genéricos (porcentajes) usan el de la moneda
   * local. Hasta la tanda 1 el dinero se formateaba con `Intl` y los separadores
   * salían del locale; hasta la tanda 2 los decimales salían de las preferencias
   * globales (moneda local / segunda moneda).
   *
   * Vacío = nadie lo publicó todavía: se usa el comportamiento de siempre.
   */
  currencyFormats: Record<string, CurrencyFormatEntry>
}

export interface CurrencyFormatEntry {
  /** Separador de miles elegido para esa moneda. */
  group?: string
  /** Separador decimal elegido para esa moneda. */
  decimal?: string
  /** Decimales elegidos para esa moneda (0..4). */
  decimals?: number
}

const DEFAULT_CONTEXT: FormatContext = {
  locale: 'es-AR',
  localCurrency: 'ARS',
  decimalsLocal: 0,
  decimalsSecondary: 1,
  decimalSeparator: ',',
  currencyFormats: {},
}

let context: FormatContext = { ...DEFAULT_CONTEXT }

/**
 * Suscripción a los cambios de contexto de formato.
 *
 * Por qué existe: `formatCurrency` es una función plana y lee un valor de
 * módulo. Un componente que la llama durante el render NO se vuelve a renderizar
 * cuando ese valor cambia, así que si el contexto se hidrata después de su
 * primer render queda mostrando el default (locale es-AR, 0 decimales) para
 * siempre: la cartera mostraba "GBP 1.737" mientras el gráfico, montado más
 * tarde, mostraba "1,500.00 GBP". `useFormatRevision` (en hooks/) resuelve eso.
 */
let formatRevision = 0
const formatListeners = new Set<() => void>()

export function subscribeFormatContext(listener: () => void): () => void {
  formatListeners.add(listener)
  return () => {
    formatListeners.delete(listener)
  }
}

/** Número de versión del contexto: cambia cuando cambia el formato. */
export function getFormatRevision(): number {
  return formatRevision
}

/** Called by `useNumberFormat` whenever the region or the preferences change. */
export function setFormatContext(next: Partial<FormatContext>): void {
  context = { ...context, ...next }
  formatRevision += 1
  for (const listener of formatListeners) listener()
}

/** Exposed for verification and tests. */
export function getFormatContext(): FormatContext {
  return { ...context }
}

function normalizeCurrency(currency: string | null | undefined): string {
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : ''
  return code || context.localCurrency
}

/** Decimals are a property of the currency: the local one, or the second currency (USD). */
function decimalsFor(currency: string): number {
  const code = normalizeCurrency(currency)

  // Tanda 2 (S19): si la moneda tiene decimales elegidos, mandan esos.
  const propio = context.currencyFormats?.[code]
  if (propio && typeof propio.decimals === 'number' && Number.isFinite(propio.decimals)) {
    return Math.min(4, Math.max(0, Math.trunc(propio.decimals)))
  }

  // Sin entrada propia se mantiene la regla histórica (USD = segunda moneda),
  // así ningún usuario ve cambiar sus números por este cambio.
  return code === 'USD' ? context.decimalsSecondary : context.decimalsLocal
}

/**
 * Separadores efectivos para una moneda. Cadena de fallback:
 *   1. la moneda pedida (lo que el usuario eligió para ESA moneda);
 *   2. la moneda local;
 *   3. nada: se deja que `Intl` decida.
 *
 * El paso 3 es deliberado. Poner acá el separador global viejo rompía el
 * comportamiento histórico del dinero: un contexto con locale en-US y sin mapa
 * terminaba formateando "$1,234,50" (coma decimal heredada) en lugar de
 * "$1,234.50". Si el mapa no llegó, el dinero se comporta como siempre.
 */
function separatorsFor(currency: string): { group?: string; decimal?: string } {
  const code = normalizeCurrency(currency)
  const propio = context.currencyFormats?.[code]
  if (propio && (propio.group || propio.decimal)) return propio

  const local = context.currencyFormats?.[normalizeCurrency(context.localCurrency)]
  if (local && (local.group || local.decimal)) return local

  return {}
}

/**
 * Aplica los separadores elegidos sin rearmar el string: `Intl` ya produjo las
 * partes (símbolo, signo, espacios y posición incluidos) y acá solo se cambian
 * los caracteres de los grupos y del decimal.
 *
 * Por qué así: es la única forma de respetar el separador del usuario sin
 * arriesgar el resto del formato. Reconstruir el texto a mano (símbolo + número)
 * es justo donde se rompe "$ 1.234" → "1.234 $".
 */
function withChosenSeparators(
  parts: Intl.NumberFormatPart[],
  separators: { group?: string; decimal?: string }
): string {
  return parts
    .map((part) => {
      if (part.type === 'group' && separators.group) return separators.group
      if (part.type === 'decimal' && separators.decimal) return separators.decimal
      return part.value
    })
    .join('')
}

export function formatCurrency(
  amount: number | string | undefined | null,
  currency?: string
): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  if (Number.isNaN(value)) return '-'

  const code = normalizeCurrency(currency)
  const digits = decimalsFor(code)
  const separators = separatorsFor(code)

  try {
    // `useGrouping: 'always'` existe desde ES2023 pero la lib de TS del repo
    // todavía tipa el campo como boolean, así que el objeto se castea. Sin esto
    // el locale español no agrupa los números de 4 dígitos y el separador de
    // miles elegido no se vería nunca en esa escala (1736 → "1736").
    const options: Record<string, unknown> = {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }
    if (separators.group) options.useGrouping = 'always'

    const formatter = new Intl.NumberFormat(
      context.locale,
      options as unknown as Intl.NumberFormatOptions
    )
    return withChosenSeparators(formatter.formatToParts(value), separators)
  } catch {
    // An unknown currency code must not break a screen: show the plain number.
    try {
      const options: Record<string, unknown> = {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }
      if (separators.group) options.useGrouping = 'always'
      const formatter = new Intl.NumberFormat(
        context.locale,
        options as unknown as Intl.NumberFormatOptions
      )
      return withChosenSeparators(formatter.formatToParts(value), separators)
    } catch {
      return String(value)
    }
  }
}

/**
 * Dual-path para display: fecha calendario pura (YYYY-MM-DD) se parsea sin
 * timezone; cualquier ISO con hora es un instante y conserva el parseo UTC
 * historico (ej: app_reportes.creado_el, timestamptz).
 */
function parseDisplayDate(dateStr: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())
    ? parseCalendarDate(dateStr)
    : new Date(dateStr)
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-'
  // YYYY-MM-DD es fecha calendario: parsearla con new Date() la manda a
  // UTC medianoche y en UTC-3 muestra el dia anterior (bug de cuarentena).
  // Los ISO con hora son instantes y conservan el parseo UTC historico.
  const d = parseDisplayDate(dateStr)
  if (Number.isNaN(d.getTime())) return String(dateStr)
  try {
    return new Intl.DateTimeFormat(context.locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d)
  } catch {
    return String(dateStr)
  }
}

export function formatDateShort(dateStr: string | undefined | null): string {
  if (!dateStr) return '-'
  const d = parseDisplayDate(dateStr)
  if (Number.isNaN(d.getTime())) return String(dateStr)
  try {
    return new Intl.DateTimeFormat(context.locale, { day: 'numeric', month: 'short' }).format(d)
  } catch {
    return String(dateStr)
  }
}

export function formatNumber(amount: number | string | undefined | null): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  if (Number.isNaN(value)) return '-'
  // Plain numbers keep their own rule (no decimals): this formats counts, not money.
  // Only the locale is borrowed from the context, so the separators match the user.
  try {
    return new Intl.NumberFormat(context.locale, { maximumFractionDigits: 0 }).format(value)
  } catch {
    return String(value)
  }
}

/**
 * Porcentaje con el separador decimal que el usuario eligio en su configuracion
 * regional. Existe porque el modulo de Inversiones formateaba con `toFixed(2)`,
 * que siempre usa punto: un usuario con coma configurada veia "12.62%" en vez
 * de "12,62%".
 *
 * `signed` agrega el "+" en los valores positivos (rendimientos). Los
 * porcentajes de reparto (la tabla del grafico) van sin signo.
 */
export function formatPercent(
  value: number | string | null | undefined,
  options: { decimals?: number; signed?: boolean } = {}
): string {
  const { decimals = 2, signed = true } = options
  if (value === null || value === undefined || value === '') return '-'
  const n = typeof value === 'string' ? parseFloat(value) : Number(value)
  if (Number.isNaN(n)) return '-'
  const fixed = n.toFixed(decimals)
  // Regla del dueño: los valores genéricos usan el separador de la MONEDA LOCAL
  // (no el de la moneda de un activo en particular, porque un porcentaje no
  // pertenece a ninguna moneda).
  const separator = separatorsFor(context.localCurrency).decimal || context.decimalSeparator || ','
  const withSeparator = fixed.replace('.', separator)
  if (signed && n > 0) return `+${withSeparator}%`
  return `${withSeparator}%`
}
