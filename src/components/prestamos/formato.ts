// Shared renderers for the loans module.
//
// They exist so the "unknown is not zero" rule (S18) is enforced in one place:
// `formatCurrency(null)` would happily print 0, and a missing indicator must be
// rendered as "cannot be calculated with the available information" instead.
import { formatCurrency, formatDateShort, formatPercent } from '@/lib/format'
import { t } from '@/locales/i18n'
import { numero } from './types'

export function montoONoCalculable(valor: number | null | undefined, moneda: string): string {
  const n = numero(valor)
  return n === null ? t('prestamos_saneamiento_no_calculable') : formatCurrency(n, moneda)
}

export function fechaOTexto(valor: string | null | undefined, claveVacio: string): string {
  return valor ? formatDateShort(valor) : t(claveVacio)
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
