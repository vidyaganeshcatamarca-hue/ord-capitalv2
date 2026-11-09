// src/lib/swipeDismiss.ts
// ============================================
// Swipe-to-dismiss threshold
// ============================================
//
// Owner (2026-11-02): "un barrido lateral hacia cualquiera de los dos lugares me haga
// desaparecer la notificación [...] Yo hago clic en la notificación y me lleva a la
// acción [...] Pero si la deslizo, la quito a la notificación".
//
// A tap must open the action and a sideways flick must dismiss it, so the gesture and
// the tap cannot share one threshold: horizontal travel has to win clearly over the
// vertical, or scrolling the panel would dismiss rows by accident.

/** Minimum horizontal travel, in CSS pixels, that counts as a dismiss flick. */
export const SWIPE_DISMISS_PX = 60

/**
 * True when a touch gesture is a sideways dismiss flick rather than a tap or a scroll.
 *
 * Pure on purpose: the rule is the whole behaviour and can be tested without a DOM.
 */
export function isDismissSwipe(
  dx: number,
  dy: number,
  threshold: number = SWIPE_DISMISS_PX,
): boolean {
  return Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy)
}
