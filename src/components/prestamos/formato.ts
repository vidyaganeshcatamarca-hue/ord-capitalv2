// Shared renderers for the loans module.
//
// They exist so the "unknown is not zero" rule (S18) is enforced in one place:
// `formatCurrency(null)` would happily print 0, and a missing indicator must be
// rendered as "cannot be calculated with the available information" instead.
import { formatCurrency, formatCurrencyNumber, formatDateShort, formatPercent } from '@/lib/format'
import { t } from '@/locales/i18n'
import { numero, type EventoCalendarioUnificado } from './types'

export function montoONoCalculable(valor: number | null | undefined, moneda: string): string {
  const n = numero(valor)
  return n === null ? t('prestamos_saneamiento_no_calculable') : formatCurrency(n, moneda)
}

export function fechaOTexto(valor: string | null | undefined, claveVacio: string): string {
  return valor ? formatDateShort(valor) : t(claveVacio)
}

/**
 * Amount of one calendar event. A loan event carries its own currency; a card due
 * date arrives already expressed in the user's local currency; a recurring expense
 * has no currency of its own, so it is shown WITHOUT a symbol plus the caller's
 * explicit «no currency» note — stamping a symbol on it when the row does not carry
 * one would be inventing a currency (S26).
 *
 * The currencyless case goes through `formatCurrencyNumber`, not `formatNumber`:
 * `formatNumber` takes its grouping from the locale, so an English reader saw
 * «50,000» next to money rendered with the separators they chose («1.000,0») in the
 * same list. Both cases now share the decimals-per-currency and the regional
 * separator rule, so one screen cannot mix two number dialects again.
 */
export function montoEvento(evento: EventoCalendarioUnificado): string {
  const n = numero(evento.monto)
  if (n === null) return t('prestamos_saneamiento_no_calculable')
  if (evento.formato === 'numero') return formatCurrencyNumber(n)
  return formatCurrency(n, evento.moneda ?? undefined)
}

/** `cat_dry_goods` -> `Dry goods`. Last resort, for a key with no dictionary entry. */
function humanizarClave(clave: string): string {
  const texto = clave.replace(/^cat_/, '').replace(/_/g, ' ').trim()
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Human name of a calendar event (S27).
 *
 * A recurring expense arrives either as the user's own name or as the category KEY
 * (`cat_dry_goods`, because `fn_reporte_calendario_financiero` sends
 * `COALESCE(nombre_custom, nombre_cuenta)`). A key is resolved through the same
 * dictionary as the rest of the app; if it has no entry, the key is humanised — the
 * raw `cat_*` string is never shown.
 */
export function etiquetaEvento(nombre: string | null | undefined): string {
  const texto = (nombre ?? '').trim()
  if (!texto) return t('prestamos_calendario_sin_nombre')
  // Only an identifier is treated as a key: a free-text name with spaces
  // ("Almacén del barrio") must never be looked up, it is already the name.
  const esClave = /^cat_/.test(texto) || /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(texto)
  if (!esClave) return texto
  return t(texto, { defaultValue: humanizarClave(texto) || t('prestamos_calendario_sin_nombre') })
}

/**
 * The annual rate is only shown when the backend says it was actually informed.
 * An uninformed rate orders as 0 % in the plan but is never presented as a real 0 %.
 */
export function tasaTexto(tasa: number | null | undefined, informada: boolean): string {
  const n = numero(tasa)
  if (!informada || n === null) return t('prestamos_lista_tasa_no_informada')
  return formatPercent(n)
}

export function textoEstadoVencimiento(estado: string | null | undefined, clave: string | null): string {
  return clave ? t(clave) : String(estado ?? '')
}
