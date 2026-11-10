// src/lib/modoPresupuesto.ts
// ============================================
// Last known budget mode, kept across reloads
// ============================================
//
// Owner (2026-11-02): after airplane mode the bottom bar showed "Tarjetas" where it
// shows "Base 0", and reopening the app fixed it. The bar starts in 'anticipado' and
// learns the real mode from fn_obtener_config_presupuesto; offline that call fails,
// so the bar fell back to the wrong label for a user who is in base cero.
//
// The mode changes rarely and the bar only needs "what was it last time", so it is
// cached locally and the fetch corrects it when it succeeds.

export type ModoPresupuesto = 'base_cero' | 'anticipado'

export const MODO_PRESUPUESTO_KEY = 'ord.modo-presupuesto'

/**
 * Resolves the mode from whatever storage holds.
 *
 * Pure so the offline rule is testable without a DOM: a known 'base_cero' survives,
 * anything else falls back to 'anticipado', which is the app default.
 */
export function initialModo(stored: string | null | undefined): ModoPresupuesto {
  return stored === 'base_cero' ? 'base_cero' : 'anticipado'
}

/** Last mode the server told us, or the app default when there is nothing stored. */
export function readModoPresupuesto(): ModoPresupuesto {
  try {
    return initialModo(localStorage.getItem(MODO_PRESUPUESTO_KEY))
  } catch {
    return 'anticipado'
  }
}

/** Remembers the server answer so a failed fetch keeps the right bar. */
export function writeModoPresupuesto(modo: string | null | undefined): void {
  try {
    if (modo === 'base_cero' || modo === 'anticipado') {
      localStorage.setItem(MODO_PRESUPUESTO_KEY, modo)
    }
  } catch {
    // Private mode or storage blocked: the bar falls back to the fetch alone.
  }
}
