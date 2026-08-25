import { useState, useCallback, useRef, useEffect } from 'react';
import type { TourScreenId } from '@/tours/ids';
import { useTourProgress } from './useTourProgress';
import { loadTour } from '@/tours/registry';
import { resolveStepI18n } from '@/tours/core/i18nResolver';
import { createTourDriver, resolveTourElement } from '@/tours/core/shepherdWrapper';
import type { Tour as ShepherdTour } from 'shepherd.js';

const CINEMATIC_BODY_CLASS = 'ord-tour-cinematic';

/**
 * For the cinematic pilot we only ship step 1 (hero-card) and step 2
 * (donut). The remaining JSON steps are kept in `home.tour.json` for the
 * next iteration but are filtered out at runtime so the user only sees
 * the two cinematic steps. The wrapper detects the last step and renders
 * "Entendido" instead of "Siguiente", ending the tour after step 2.
 */
const CINEMATIC_TOUR_SCREENS: TourScreenId[] = ['home'];

/**
 * Selectors for the elements that get the cinematic 3-phase cascade.
 * These are the steps that survive the runtime filter. Order matters:
 * the tour runs in the order declared here.
 */
const CINEMATIC_STEP_TARGETS = [
  'home-hero-card',
  'home-expenses-donut',
  'home-expenses-toggle-rubros',
  'home-expenses-ver-todos',
  'home-billeteras',
  'home-billeteras-filtro',
  'home-misterio-alerta',
  'home-actividad',
  'home-header-aux',
  'home-fab-registrar',
] as const;

function isCinematicTourScreen(screenId: TourScreenId): boolean {
  return CINEMATIC_TOUR_SCREENS.includes(screenId);
}

export function useTour(screenId: TourScreenId) {
  const {
    isSeen,
    markSeen,
    hasStarted,
    markStarted,
    getStoredVersion,
    setStoredVersion,
  } = useTourProgress();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const tourRef = useRef<ShepherdTour | null>(null);

  const hasSeenTour = isSeen(screenId);
  const hasStartedTour = hasStarted(screenId);

  const startTour = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const tour = await loadTour(screenId);

      // Mark as started the first time the user launches the tour. The ?
      // trigger button hides from this point on; the user must go to /ayuda
      // to re-launch.
      markStarted(screenId);

      // Version check: if the JSON version is newer than what the user has
      // stored, persist the new version. We do NOT touch `seen` state here
      // because the button visibility is driven by `started` now, not `seen`.
      const storedVersion = getStoredVersion(screenId);
      if (tour.version > (storedVersion ?? 0)) {
        setStoredVersion(screenId, tour.version);
      }

      // Build Shepherd steps. Element is HTMLElement directly (not selector).
      const steps: Array<{
        element: HTMLElement;
        popover: { title: string; description: string; position?: string; className?: string };
        intraElement?: boolean;
        arrowSignalTo?: string;
      }> = [];

      // For the cinematic pilot we filter to ONLY the configured targets.
      // The full JSON keeps the rest of the steps for the next iteration
      // (so the `version` bump and `ids.ts` registry stay authoritative),
      // but the user never sees them in this run.
      const sourceSteps = isCinematicTourScreen(screenId)
        ? tour.steps.filter((step) =>
            (CINEMATIC_STEP_TARGETS as readonly string[]).includes(step.target)
          )
        : tour.steps;

      sourceSteps.forEach((step) => {
        const element = resolveTourElement(step.target);
        if (!element) return;
        const i18n = resolveStepI18n(tour, step);
        // Defensive: only append howTo if it's a real translation (not the raw key fallback)
        const hasHowTo = i18n.howTo && !i18n.howTo.startsWith(`${tour.i18nPrefix}.`);
        const description = hasHowTo ? `${i18n.description}\n\n${i18n.howTo}` : i18n.description;
        steps.push({
          element,
          popover: {
            title: i18n.title,
            description,
            position: step.placement,
            className: 'ord-tour-popover',
          },
          intraElement: (step as any).intraElement === true,
          arrowSignalTo: (step as any).arrowSignalTo as string | undefined,
        });
      });

      if (steps.length === 0) {
        console.warn(`[Tour] No valid steps for screenId: ${screenId}`);
        return;
      }

      const tourInstance = createTourDriver(
        tour,
        steps,
        () => {
          // onClosed: cleanup only
          tourRef.current = null;
          document.body.classList.remove(CINEMATIC_BODY_CLASS);
        },
        () => {
          // onCompleted: mark as seen when user completes last step
          markSeen(screenId);
          setStoredVersion(screenId, tour.version);
          document.body.classList.remove(CINEMATIC_BODY_CLASS);
        }
      );

      tourRef.current = tourInstance;

      // Scroll first element into view BEFORE starting tour so the user sees the right region
      const firstEl = steps[0].element;
      if (firstEl && typeof firstEl.scrollIntoView === 'function') {
        firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      tourInstance.start();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      console.error('[Tour] Failed to start tour:', e);
    } finally {
      setIsLoading(false);
    }
  }, [screenId, getStoredVersion, setStoredVersion, markStarted, markSeen]);

  // Defensive cleanup: if the host component unmounts while the tour is
  // still active, cancel the tour and strip the cinematic body class so
  // the next mount of any UI doesn't inherit leftover state.
  useEffect(() => {
    return () => {
      if (tourRef.current) {
        try {
          tourRef.current.cancel();
        } catch {
          // ignore: tour may already be torn down
        }
        tourRef.current = null;
      }
      if (typeof document !== 'undefined') {
        document.body.classList.remove(CINEMATIC_BODY_CLASS);
      }
    };
  }, []);

  return { startTour, hasSeenTour, hasStartedTour, isLoading, error };
}
