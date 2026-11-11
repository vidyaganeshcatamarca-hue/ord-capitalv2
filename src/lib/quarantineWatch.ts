// src/lib/quarantineWatch.ts
// ============================================
// Ventana de vigilancia de la cuarentena
// ============================================
//
// Para qué existe: el FAB de cuarentena necesita enterarse cuando un audio o un
// ticket OCR acaba de entrar. Antes eso se resolvía con un intervalo de 15 s que
// corría siempre que el Home estuviera montado — 1.920 llamadas en una jornada de
// 8 horas, cada una un viaje de red, para un dato que sólo cambia cuando el
// usuario envía algo.
//
// Ahora el envío abre una ventana corta y el FAB sólo pregunta dentro de ella.
// La ventana es deliberadamente **en memoria y no persistente**: si el usuario
// cierra la app, la vigilancia se va con ella. Nadie quiere un poll cada 15 s por
// un audio de ayer.
//
// Decisión del dueño (2026-11-11): ventana de 5 minutos, y cero polling fuera de
// ella — al volver al Home el componente se remonta y consulta una vez.

/** Cuánto dura la vigilancia después de un envío (decisión del dueño: 5 minutos). */
export const VENTANA_ENVIO_MS = 5 * 60 * 1000

let ultimoEnvio = 0
const oyentes = new Set<() => void>()

/** Marca que el usuario acaba de mandar un audio o un ticket OCR a la cuarentena. */
export function marcarEnvioCuarentena(): void {
  ultimoEnvio = Date.now()
  for (const oyente of oyentes) oyente()
}

/** ¿Hubo un envío dentro de la ventana? */
export function hayEnvioReciente(ventanaMs: number = VENTANA_ENVIO_MS): boolean {
  if (ultimoEnvio === 0) return false
  return Date.now() - ultimoEnvio < ventanaMs
}

/** Milisegundos que le quedan a la ventana abierta (0 si no hay ninguna). */
export function msRestantesDeVentana(ventanaMs: number = VENTANA_ENVIO_MS): number {
  if (!hayEnvioReciente(ventanaMs)) return 0
  return Math.max(0, ventanaMs - (Date.now() - ultimoEnvio))
}

/** Escucha los envíos nuevos. Devuelve la baja. */
export function suscribirEnvioCuarentena(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

/** Sólo para tests: deja la vigilancia como recién arrancada. */
export function reiniciarVigilanciaCuarentena(): void {
  ultimoEnvio = 0
  oyentes.clear()
}
