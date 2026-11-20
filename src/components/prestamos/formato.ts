// Shared renderers for the loans module.
//
// They exist so the "unknown is not zero" rule (S18) is enforced in one place:
// `formatCurrency(null)` would happily print 0, and a missing indicator must be
// rendered as "cannot be calculated with the available information" instead.
import {
  formatCurrencyNumber,
  formatCurrencyWithSymbol,
  formatDateShort,
  formatPercent,
  getFormatContext,
} from '@/lib/format'
import { resolveCurrencySymbol } from '@/lib/currencySymbol'
import { t } from '@/locales/i18n'
import { numero, type EventoCalendarioUnificado } from './types'

/**
 * Locale que se usa SÓLO para leer el símbolo de una moneda que NO es la del
 * usuario. `es-AR` es el contexto regional por defecto de la app (`DEFAULT_CONTEXT`
 * en `lib/format.ts`) y ahí Intl desambigua las monedas extranjeras: dice `US$`
 * donde el inglés dice `$` en todas sus regiones.
 */
const LOCALE_MONEDA_EXTRANJERA = 'es-AR'

/**
 * Símbolo con el que se muestra una moneda, conservando SIEMPRE su identidad (A2).
 *
 * El idioma decide las fechas y la forma del número, pero no puede decidir qué
 * moneda es: en inglés Intl colapsa USD a un `$` pelado y el importe de un préstamo
 * en dólares pasa a leerse como plata local. La regla es acotada:
 *
 *   1. la moneda local del usuario se muestra como la muestra el resto de la app;
 *   2. si el símbolo activo ya viene identificado (`US$`, `ARS`, `R$`) no se toca;
 *   3. si viene como signo pelado y el contexto regional por defecto conoce una
 *      forma CALIFICADA DEL MISMO SIGNO (`US$` para `$`), se usa esa;
 *   4. un código ISO (`EUR` para `€`) no es un símbolo mejor: se descarta.
 *
 * Así es/pt no cambian nada (ya dicen `US$`) y en deja de mentir sobre la moneda.
 */
function simboloConIdentidad(moneda: string): string {
  const { locale, localCurrency } = getFormatContext()
  const activo = resolveCurrencySymbol(moneda, locale)

  if (moneda === String(localCurrency ?? '').toUpperCase()) return activo
  if (/[A-Za-z]/.test(activo)) return activo

  const calificado = resolveCurrencySymbol(moneda, LOCALE_MONEDA_EXTRANJERA)
  const esElMismoSignoCalificado =
    calificado !== activo && (calificado.endsWith(activo) || calificado.startsWith(activo))
  return esElMismoSignoCalificado ? calificado : activo
}

/**
 * Importe de una operación en SU moneda. Una moneda sin informar NO se inventa:
 * se muestra el número sin símbolo (`formatCurrencyNumber`), que es lo que el
 * contexto puede probar.
 */
export function montoMoneda(
  valor: number | string | null | undefined,
  moneda: string | null | undefined
): string {
  const n = numero(valor)
  if (n === null) return t('prestamos_saneamiento_no_calculable')
  const codigo = String(moneda ?? '').trim().toUpperCase()
  if (!codigo) return formatCurrencyNumber(n)
  return formatCurrencyWithSymbol(n, codigo, simboloConIdentidad(codigo))
}

/**
 * Igual que `montoMoneda`, pero distinguiendo «no hay dato» de «vale cero» (S18):
 * un importe desconocido nunca se imprime como 0.
 */
export function montoONoCalculable(valor: number | null | undefined, moneda: string): string {
  const n = numero(valor)
  return n === null ? t('prestamos_saneamiento_no_calculable') : montoMoneda(n, moneda)
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
 *
 * A loan amount goes through `montoMoneda`, the module's single money path: it is
 * the one that keeps the operation's own currency readable in every language (A2).
 */
export function montoEvento(evento: EventoCalendarioUnificado): string {
  const n = numero(evento.monto)
  if (n === null) return t('prestamos_saneamiento_no_calculable')
  if (evento.formato === 'numero') return formatCurrencyNumber(n)
  return montoMoneda(n, evento.moneda)
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
