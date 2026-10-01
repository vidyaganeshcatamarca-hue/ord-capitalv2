// ============================================
// Pending bug-report registrations (v1)
// ============================================
// Owner flow: when the fn_crear_reporte call does not answer within 15s the
// form frees the user (back to Ajustes) but the request keeps running. The
// outcome is announced through a toast "independientemente de la pantalla":
// a single App-level watcher resolves every registered submission.

export type ReporteOutcome = { ok: boolean; reporteId: number | null }

type Listener = (promise: Promise<ReporteOutcome>) => void

const listeners = new Set<Listener>()

export function onPendingReporte(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Register an in-flight submission so its eventual result reaches any screen. */
export function trackPendingReporte(promise: Promise<ReporteOutcome>): void {
  const promiseListener = listeners
  promise.finally(() => {
    // no-op bookkeeping
  })
  for (const l of promiseListener) l(promise)
}