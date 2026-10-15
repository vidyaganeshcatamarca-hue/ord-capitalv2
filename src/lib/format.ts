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
}

const DEFAULT_CONTEXT: FormatContext = {
  locale: 'es-AR',
  localCurrency: 'ARS',
  decimalsLocal: 0,
  decimalsSecondary: 1,
}

let context: FormatContext = { ...DEFAULT_CONTEXT }

/** Called by `useNumberFormat` whenever the region or the preferences change. */
export function setFormatContext(next: Partial<FormatContext>): void {
  context = { ...context, ...next }
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
  return currency === 'USD' ? context.decimalsSecondary : context.decimalsLocal
}

export function formatCurrency(
  amount: number | string | undefined | null,
  currency?: string
): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  if (Number.isNaN(value)) return '-'

  const code = normalizeCurrency(currency)
  const digits = decimalsFor(code)

  try {
    return new Intl.NumberFormat(context.locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
  } catch {
    // An unknown currency code must not break a screen: show the plain number.
    return new Intl.NumberFormat(context.locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
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
