export interface Billetera {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
  es_fondo_prevision: boolean
  ultima_conciliacion_at: string | null
  icono: string
  es_compartida: boolean
  saldo_inicial_pendiente: boolean
}

export interface BilleteraHealthReport {
  billetera_id: number
  nombre: string
  moneda: string
  saldo_actual: number
  dias_sin_conciliar: number
  estado_semaforo_key: 'green' | 'yellow' | 'red'
  alertas_keys: string[]
}
