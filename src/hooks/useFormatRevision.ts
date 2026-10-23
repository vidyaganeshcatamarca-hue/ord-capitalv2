import { useSyncExternalStore } from 'react'
import { getFormatRevision, subscribeFormatContext } from '@/lib/format'

/**
 * Vuelve a renderizar el componente cuando cambia el contexto de formato
 * (locale, decimales o separadores por moneda).
 *
 * Hace falta porque `formatCurrency`/`formatPercent` son funciones planas que
 * leen un valor de módulo: sin esta suscripción, un componente ya montado se
 * queda con el formato del primer render. El caso real que lo destapó: la
 * cartera mostraba "GBP 1.737" (default es-AR) mientras el gráfico, montado
 * después de la hidratación, mostraba "1,500.00 GBP".
 *
 * Uso: una línea, sin tocar la lógica del componente.
 *   useFormatRevision()
 */
export function useFormatRevision(): number {
  return useSyncExternalStore(
    subscribeFormatContext,
    getFormatRevision,
    getFormatRevision
  )
}

export default useFormatRevision
