export interface Sobre {
  fondo_id: number
  nombre: string
  saldo_actual: number
  monto_meta: number
  porcentaje_progreso: number
  dias_restantes: number
  estado_alerta_key: string
  cuota_sugerida?: number
  monto_faltante?: number
  meses_restantes?: number
}

export interface BilleteraOperativa {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
  es_fondo_prevision: boolean
  icono?: string | null
}

export type TransferMode = 'provision' | 'rescue'
