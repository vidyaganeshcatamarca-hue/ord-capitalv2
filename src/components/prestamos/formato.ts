// Shared renderers for the loans module.
//
// They exist so the "unknown is not zero" rule (S18) is enforced in one place:
// `formatCurrency(null)` would happily print 0, and a missing indicator must be
// rendered as "cannot be calculated with the available information" instead.
import { formatCurrency, formatDateShort, formatNumber, formatPercent } from '@/lib/format'
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
 * date arrives in the local currency; a recurring expense has no currency of its
 * own, so it is shown as a plain number exactly like the recurring module does —
 * stamping a currency on it would be inventing one.
 */
export function montoEvento(evento: EventoCalendarioUnificado): string {
  const n = numero(evento.monto)
  if (n === null) return t('prestamos_saneamiento_no_calculable')
  if (evento.formato === 'numero') return formatNumber(n)
  return formatCurrency(n, evento.moneda ?? undefined)
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
