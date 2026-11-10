/**
 * Tipos del módulo Ahorro / Sobres.
 *
 * El sobre ya no es una billetera: `p_sobres` + `p_sobre_movimientos`. El saldo
 * y las porciones se derivan en la base y llegan calculados desde las RPC.
 */

export type EstadoSobre =
  | 'state_fulfilled'
  | 'state_overdue'
  | 'state_plan_started'
  | 'state_green'
  | 'state_yellow'
  | 'state_red'
  | 'state_free_savings'
  | 'state_project'

export interface Sobre {
  sobre_id: number
  nombre: string
  moneda: string
  saldo: number
  monto_meta: number | null
  fecha_objetivo: string | null
  plan_inicio_at: string
  porcentaje_progreso: number | null
  monto_faltante: number | null
  dias_restantes: number | null
  estado_key: EstadoSobre
  cuota_mensual: number | null
  cuota_quincenal: number | null
  cuota_semanal: number | null
  orden: number
  orden_manual: boolean
  archivado_at: string | null
  tiene_rendimiento: boolean
}

/** Una porción viva: de qué billetera salió el dinero y con qué modalidad. */
export interface SobrePorcion {
  billetera_id: number
  billetera_nombre: string
  moneda: string
  modalidad: ModalidadReserva
  saldo: number
  genera_rendimiento: boolean
}

export interface SobreMovimiento {
  movimiento_id: number
  fecha: string
  tipo: 'aporte' | 'rescate' | 'rendimiento'
  importe: number
  billetera_id: number
  billetera_nombre: string
  modalidad: ModalidadReserva
}

export interface SobrePlan {
  saldo: number
  porcentaje_progreso: number | null
  monto_faltante: number | null
  dias_restantes: number | null
  estado_key: EstadoSobre
  cuota_mensual: number | null
  cuota_quincenal: number | null
  cuota_semanal: number | null
}

export interface SobreDetalle {
  sobre: {
    sobre_id: number
    nombre: string
    moneda: string
    monto_meta: number | null
    fecha_objetivo: string | null
    plan_inicio_at: string
    orden: number
    orden_manual: boolean
    archivado_at: string | null
    icono: string
  }
  plan: SobrePlan
  porciones: SobrePorcion[]
  historial: SobreMovimiento[]
}

/** DF-01: el usuario decidió si el dinero está afuera o reservado sólo en ORD. */
export type ModalidadReserva = 'real' | 'virtual'

export interface BilleteraOperativa {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
  es_fondo_prevision: boolean
  icono?: string | null
}

/** Una línea del formulario de rescate: cuánto sale de una porción concreta. */
export interface AsignacionRescate {
  billetera_id: number
  modalidad: ModalidadReserva
  importe: number
}

export interface NormalizableSobre {
  sobre_id: number
  nombre: string
  moneda: string
  saldo: number
  monto_meta: number | null
  fecha_objetivo: string | null
  plan_inicio_at: string
  porcentaje_progreso: number | null
  monto_faltante: number | null
  dias_restantes: number | null
  estado_key: string
  cuota_mensual: number | null
  cuota_quincenal: number | null
  cuota_semanal: number | null
  orden: number
  orden_manual: boolean
  archivado_at: string | null
  tiene_rendimiento: boolean
}

const numero = (valor: unknown): number => Number(valor ?? 0)

const numeroONull = (valor: unknown): number | null =>
  valor === null || valor === undefined ? null : Number(valor)

/** Normaliza una fila de `fn_sobres_listar` (los numeric llegan como string). */
export function normalizarSobre(row: any): Sobre {
  return {
    sobre_id: numero(row.sobre_id),
    nombre: String(row.nombre ?? ''),
    moneda: String(row.moneda ?? 'ARS'),
    saldo: numero(row.saldo),
    monto_meta: numeroONull(row.monto_meta),
    fecha_objetivo: row.fecha_objetivo ? String(row.fecha_objetivo) : null,
    plan_inicio_at: String(row.plan_inicio_at ?? ''),
    porcentaje_progreso: numeroONull(row.porcentaje_progreso),
    monto_faltante: numeroONull(row.monto_faltante),
    dias_restantes: numeroONull(row.dias_restantes),
    estado_key: (row.estado_key ?? 'state_free_savings') as EstadoSobre,
    cuota_mensual: numeroONull(row.cuota_mensual),
    cuota_quincenal: numeroONull(row.cuota_quincenal),
    cuota_semanal: numeroONull(row.cuota_semanal),
    orden: numero(row.orden),
    orden_manual: Boolean(row.orden_manual),
    archivado_at: row.archivado_at ? String(row.archivado_at) : null,
    tiene_rendimiento: Boolean(row.tiene_rendimiento),
  }
}

export function normalizarBilletera(row: any): BilleteraOperativa {
  return {
    billetera_id: numero(row.billetera_id),
    nombre: String(row.nombre ?? ''),
    moneda: String(row.moneda ?? 'ARS'),
    saldo_actual: numero(row.saldo_actual),
    es_fondo_prevision: Boolean(row.es_fondo_prevision),
    icono: row.icono ?? null,
  }
}

export function normalizarPorcion(row: any): SobrePorcion {
  return {
    billetera_id: numero(row.billetera_id),
    billetera_nombre: String(row.billetera_nombre ?? ''),
    moneda: String(row.moneda ?? 'ARS'),
    modalidad: (row.modalidad === 'real' ? 'real' : 'virtual') as ModalidadReserva,
    saldo: numero(row.saldo),
    genera_rendimiento: Boolean(row.genera_rendimiento),
  }
}

export function normalizarDetalle(data: any): SobreDetalle {
  const sobre = data?.sobre ?? {}
  const plan = data?.plan ?? {}
  return {
    sobre: {
      sobre_id: numero(sobre.sobre_id),
      nombre: String(sobre.nombre ?? ''),
      moneda: String(sobre.moneda ?? 'ARS'),
      monto_meta: numeroONull(sobre.monto_meta),
      fecha_objetivo: sobre.fecha_objetivo ? String(sobre.fecha_objetivo) : null,
      plan_inicio_at: String(sobre.plan_inicio_at ?? ''),
      orden: numero(sobre.orden),
      orden_manual: Boolean(sobre.orden_manual),
      archivado_at: sobre.archivado_at ? String(sobre.archivado_at) : null,
      icono: String(sobre.icono ?? '💰'),
    },
    plan: {
      saldo: numero(plan.saldo),
      porcentaje_progreso: numeroONull(plan.porcentaje_progreso),
      monto_faltante: numeroONull(plan.monto_faltante),
      dias_restantes: numeroONull(plan.dias_restantes),
      estado_key: (plan.estado_key ?? 'state_free_savings') as EstadoSobre,
      cuota_mensual: numeroONull(plan.cuota_mensual),
      cuota_quincenal: numeroONull(plan.cuota_quincenal),
      cuota_semanal: numeroONull(plan.cuota_semanal),
    },
    porciones: Array.isArray(data?.porciones) ? data.porciones.map(normalizarPorcion) : [],
    historial: Array.isArray(data?.historial)
      ? data.historial.map((h: any) => ({
          movimiento_id: numero(h.movimiento_id),
          fecha: String(h.fecha ?? ''),
          tipo: h.tipo as SobreMovimiento['tipo'],
          importe: numero(h.importe),
          billetera_id: numero(h.billetera_id),
          billetera_nombre: String(h.billetera_nombre ?? ''),
          modalidad: (h.modalidad === 'real' ? 'real' : 'virtual') as ModalidadReserva,
        }))
      : [],
  }
}
