// Contract types and translations of the loans module (T3, T11, T18, T20, T24).
//
// The backend is the source of truth for everything derived:
//   * `estado_vencimiento` arrives already computed (al_dia | proximo_a_vencer |
//     vencido | saldado | sin_fecha). This module only translates it, it never
//     recomputes it from dates.
//   * Debo and Me deben are two separate universes: nothing here subtracts one
//     from the other, and no helper sums amounts of different currencies.
//   * An indicator that could not be computed arrives as `null`. It is rendered
//     as "cannot be calculated", never as 0.

export type Direccion = 'debo' | 'me_deben'
export type Estrategia = 'math' | 'emotional' | 'relationships'
export type Modalidad = 'cuotas' | 'vencimiento_unico' | 'libre'
export type CondicionInteres = 'ninguno' | 'importe_final' | 'tasa' | 'desconocido'

/**
 * One installment of the schedule the user types. `capital_componente` is never
 * sent: if the user only informed the interest portion, the capital portion is
 * not known here and the backend stores NULL, which means exactly that.
 */
export interface CuotaInput {
  fecha_vencimiento: string
  monto_cuota: number
  interes_componente?: number | null
}

export interface PrestamoResumenFila {
  direccion: Direccion
  moneda: string
  pendiente: number | null
  pagado_registrado: number | null
  prestamos_activos: number
  prestamos_saldados: number
}

export interface PrestamoListaItem {
  prestamo_id: number
  direccion: Direccion
  contraparte: string
  nombre: string
  moneda: string
  saldo_pendiente: number | null
  monto_original: number | null
  pagado_registrado: number | null
  estado: string
  estado_vencimiento: string
  proximo_vencimiento: string | null
  tasa: number | null
  tasa_informada: boolean
  modalidad: Modalidad
  tiene_cronograma: boolean
  /** `p_prestamos.contraparte_user_id`: the member named as counterparty, if any. */
  contraparte_user_id: number | null
  /** Name of that counterparty, or null when the loan names none. */
  contraparte_nombre: string | null
  /**
   * Server-side classification: true when the counterparty of this loan is a member of the
   * caller's household. It is deliberately NOT compared against the caller, so a co-owned
   * loan naming B lands in A's group and in B's group — for B the counterparty is B itself.
   * A caller with no household always gets false. The client cannot compute this: it never
   * learns the other member's user id.
   */
  contraparte_integrante: boolean
}

export interface PrestamoCuota {
  cuota_id: number
  numero_cuota: number
  fecha_vencimiento: string
  monto_cuota: number
  capital_componente: number | null
  interes_componente: number | null
  vencida: boolean
}

export interface PrestamoPago {
  pago_id: number
  direccion: string
  fecha: string
  p_caja_id: number | null
  billetera_id: number | null
  moneda_billetera: string | null
  monto_billetera: number | null
  monto_aplicado: number | null
  capital_aplicado: number | null
  interes_aplicado: number | null
  interes_excedente: number | null
  nota: string | null
  estado: string
}

export interface PrestamoDetalle {
  prestamo_id: number
  direccion: Direccion
  contraparte: string
  nombre: string
  /** `personal` | `institucional`; null when the backend has no record of it. */
  tipo_deuda: string | null
  moneda: string
  monto_original: number | null
  saldo_al_ingreso: number | null
  saldo_pendiente: number | null
  pagado_registrado: number | null
  modalidad: Modalidad
  condicion_interes: CondicionInteres | null
  interes_total_acordado: number | null
  tasa: number | null
  tasa_informada: boolean
  estado: string
  estado_vencimiento: string
  proximo_vencimiento: string | null
  cuotas: PrestamoCuota[] | null
  pagos: PrestamoPago[] | null
  total_interes_excedente: number | null
}

export interface EventoCalendarioPrestamo {
  tipo_evento: string
  fecha: string
  nombre: string
  monto: number | null
  moneda: string
  direccion: Direccion
  criticidad: string
  pagado: boolean
  prestamo_id: number
  cuota_id: number | null
  numero_cuota: number | null
}

/**
 * Row of `fn_reporte_calendario_financiero`. Deliberately has no currency: card
 * amounts arrive already expressed in the user's local currency and a recurring
 * expense has no currency of its own (that module shows it as a plain number).
 */
export interface EventoCalendarioFinanciero {
  evento_id: string
  tipo_evento: string
  fecha: string
  nombre: string | null
  monto: number | null
  criticidad: string
  pagado: boolean
}

/** Why an amount is formatted as currency or as a plain number. */
export type FormatoMontoEvento = 'moneda' | 'numero'

/**
 * One row of the merged calendar (S20, decision 17). The three sources keep
 * their own identity: a loan event carries the `prestamo_id` column, and the
 * card and recurring events never pretend to be a loan.
 */
export interface EventoCalendarioUnificado {
  clave: string
  fecha: string
  tipo: 'prestamo' | 'tarjeta' | 'recurrente'
  nombre: string
  monto: number | null
  moneda: string | null
  formato: FormatoMontoEvento
  criticidad: string
  pagado: boolean
  /** Only present on loan events, and always read from the column. */
  prestamo_id: number | null
  direccion: Direccion | null
  numero_cuota: number | null
  /**
   * True when the source row carries an amount but no currency (recurring
   * expenses). The amount is then shown with an explicit «no currency» note
   * instead of borrowing a symbol it cannot prove (S26).
   */
  moneda_sin_informar: boolean
}

export interface PlanFila {
  prestamo_id: number
  contraparte: string
  nombre: string
  moneda: string
  saldo_pendiente: number | null
  tasa: number | null
  tasa_informada: boolean
  proximo_vencimiento: string | null
  es_personal: boolean
  puntos_vinculo: number | null
  estado_vencimiento: string
  prioridad: number
  comparte_prioridad: boolean
}

export interface VinculoFila {
  prestamo_id: number
  contraparte: string
  saldo_pendiente: number | null
  moneda: string
  puntos: number | null
  criterio_1: boolean
  criterio_2: boolean
  criterio_3: boolean
}

export interface SimulacionPrestamo {
  saldo_pendiente: number | null
  monto_propuesto: number | null
  saldo_proyectado: number | null
  moneda: string
  meses_restantes: number | null
  meses_ahorrados: number | null
  intereses_ahorrados: number | null
  motivo: string | null
}

export interface ProgresoMoneda {
  moneda: string
  prestamos_activos: number
  saldo_pendiente: number | null
  pagado_registrado: number | null
  porcentaje: number | null
  fecha_fin_estimada: string | null
  motivo_sin_fecha: string | null
}

/** Everything the payment modal needs, from the list row or from the detail. */
export interface PrestamoPagoTarget {
  prestamo_id: number
  nombre: string
  moneda: string
  saldo_pendiente: number | null
  direccion: Direccion
}

/**
 * Numeric columns travel as JSON numbers, but a defensive coercion keeps a
 * `null` a `null`: turning "unknown" into 0 is exactly what the contract
 * forbids (S18).
 */
export function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

const ESTADO_KEYS: Record<string, string> = {
  al_dia: 'prestamos_estado_al_dia',
  proximo_a_vencer: 'prestamos_estado_proximo_a_vencer',
  vencido: 'prestamos_estado_vencido',
  saldado: 'prestamos_estado_saldado',
  sin_fecha: 'prestamos_estado_sin_fecha',
}

/** Translation key for the backend-computed due status. Unknown values are shown raw. */
export function estadoKey(estado: string | null | undefined): string | null {
  if (!estado) return null
  return ESTADO_KEYS[estado] ?? null
}

/** Badge tone for the backend-computed due status. Presentation only. */
export function estadoTono(estado: string | null | undefined): string {
  switch (estado) {
    case 'vencido':
      return 'is-vencido'
    case 'proximo_a_vencer':
      return 'is-proximo'
    case 'saldado':
      return 'is-saldado'
    case 'al_dia':
      return 'is-al-dia'
    default:
      return 'is-sin-fecha'
  }
}

const MODALIDAD_KEYS: Record<string, string> = {
  cuotas: 'prestamos_lista_modalidad_cuotas',
  vencimiento_unico: 'prestamos_lista_modalidad_vencimiento_unico',
  libre: 'prestamos_lista_modalidad_libre',
}

export function modalidadKey(modalidad: string | null | undefined): string | null {
  if (!modalidad) return null
  return MODALIDAD_KEYS[modalidad] ?? null
}

const CONDICION_KEYS: Record<string, string> = {
  ninguno: 'prestamos_condicion_ninguno',
  importe_final: 'prestamos_condicion_importe_final',
  tasa: 'prestamos_condicion_tasa',
  desconocido: 'prestamos_condicion_desconocido',
}

export function condicionKey(condicion: string | null | undefined): string | null {
  if (!condicion) return null
  return CONDICION_KEYS[condicion] ?? null
}

const MOTIVO_KEYS: Record<string, string> = {
  sin_cronograma: 'prestamos_saneamiento_no_calculable_sin_cronograma',
  el_pago_no_cancela_cuotas_completas: 'prestamos_saneamiento_no_calculable_cuotas_parciales',
  interes_por_cuota_no_informado: 'prestamos_saneamiento_no_calculable_interes',
  no_todos_los_prestamos_tienen_cronograma: 'prestamos_saneamiento_progreso_sin_fecha_motivo',
}

/** Why a simulation indicator is null. Absent motive falls back to the generic line. */
export function motivoKey(motivo: string | null | undefined): string | null {
  if (!motivo) return null
  return MOTIVO_KEYS[motivo] ?? null
}

/** Route of the section that owns a direction. Used by the calendar deep-link. */
export function rutaPorDireccion(direccion: string | null | undefined): string {
  return direccion === 'me_deben' ? '/prestamos/me-deben' : '/prestamos/debo'
}
