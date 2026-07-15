export interface Billetera {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
  activa?: boolean
  es_fondo_prevision?: boolean
  es_compartida?: boolean
  icono?: string
  ultima_conciliacion_at?: string | null
  saldo_inicial_pendiente?: boolean
}
