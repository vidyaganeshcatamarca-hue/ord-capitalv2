// src/tours/core/tourReadiness.ts
// Pure readiness rule for launching a tour.
//
// Owner bug (tanda 6): the guided tour of Inicio jumped straight to its LAST
// step ("Cargar datos", on the FAB) instead of starting at the hero card. Cause:
// the tour was launched from Ayuda behind a fixed 350 ms delay, and the step
// builder silently skips every target that is not in the DOM yet. The FAB lives
// in the bottom navigation (always mounted), so it was the only resolvable
// target — a single-step tour that shows "Entendido".
//
// The rule is therefore: do not build the tour until its FIRST target exists.
// Wait a bounded time, then give up and start with whatever is available.

export type TourReadiness = 'ready' | 'wait' | 'give-up'

/**
 * Decides whether the tour can be built yet.
 *
 * @param firstTargetAvailable the first expected target is already in the DOM
 * @param elapsedMs how long we have been waiting
 * @param timeoutMs the bounded wait
 */
export function tourReadiness(
  firstTargetAvailable: boolean,
  elapsedMs: number,
  timeoutMs: number,
): TourReadiness {
  if (firstTargetAvailable) return 'ready'
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  const limit = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 0
  return elapsed >= limit ? 'give-up' : 'wait'
}

/** How often the launch loop re-checks the DOM. */
export const TOUR_READY_POLL_MS = 100

/** Longest wait before launching with whatever rendered. */
export const TOUR_READY_TIMEOUT_MS = 4000
