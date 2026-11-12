// src/lib/alertas.ts
// Derivacion unica de las alertas del Home.
//
// Vive aca y no dentro de HomePage para que la campanita del Home y la del
// SideNav cuenten exactamente lo mismo. Antes cada una contaba su propia cosa:
// el Home contaba filas de alertas y el panel del SideNav contaba avisos, asi
// que el usuario veia dos numeros distintos para el mismo icono.

export interface AlertasHome {
  total_alertas: number
  egresos_cuarentena: number
  ingresos_cuarentena: number
  billeteras_rojas: number
  vencimientos_3_dias: unknown[]
  dias_asfixia_proximos: number
}

export interface AlertaFila {
  key: string
  texto: string
  conteo: number
  navegar?: string
}

/** Un descarte guarda el conteo que tenia la fila cuando se descarto. */
export type DescartesAlertas = Record<string, number>

export const ALERTAS_DESCARTADAS_KEY = 'home_alertas_descartadas'

export function leerDescartesAlertas(): DescartesAlertas {
  try {
    return JSON.parse(localStorage.getItem(ALERTAS_DESCARTADAS_KEY) || '{}') as DescartesAlertas
  } catch {
    return {}
  }
}

export function derivarAlertasFilas(
  alerts: AlertasHome | null,
  traducir: (clave: string) => string,
): AlertaFila[] {
  if (!alerts) return []

  const filas: AlertaFila[] = []

  if (alerts.egresos_cuarentena > 0) {
    filas.push({
      key: 'cuarentena',
      texto: '📥 Transacciones en Cuarentena',
      conteo: alerts.egresos_cuarentena,
      navegar: '/cuarentena',
    })
  }

  if (alerts.billeteras_rojas > 0) {
    filas.push({
      key: 'rojas',
      texto: '🔴 Cuentas desconciliadas / en rojo',
      conteo: alerts.billeteras_rojas,
    })
  }

  if (alerts.dias_asfixia_proximos > 0) {
    filas.push({
      key: 'asfixia',
      texto: traducir('home_alert_asfixia'),
      conteo: alerts.dias_asfixia_proximos,
    })
  }

  return filas
}

/**
 * Una fila queda oculta solo mientras su conteo no cambio desde que se
 * descarto: si aparece una transaccion nueva en cuarentena, vuelve a mostrarse.
 */
export function filasVisiblesAlertas(
  filas: AlertaFila[],
  descartadas: DescartesAlertas,
): AlertaFila[] {
  return filas.filter((fila) => descartadas[fila.key] !== fila.conteo)
}
