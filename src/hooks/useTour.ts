import { useState, useEffect, useRef, useCallback } from 'react';
import type { TourScreenId } from '@/tours/ids';
import { useTourProgress } from './useTourProgress';
import { loadTour } from '@/tours/registry';
import { resolveStepI18n } from '@/tours/core/i18nResolver';
import { createTourDriver, resolveTourElement } from '@/tours/core/driverWrapper';
import type { Driver } from 'driver.js';

export function useTour(screenId: TourScreenId) {
  const { isSeen, markSeen, markNotSeen, getStoredVersion, setStoredVersion } = useTourProgress();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const driverRef = useRef<Driver | null>(null);

  const hasSeenTour = isSeen(screenId);

  const startTour = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const tour = await loadTour(screenId);

      // Version check: if tour version > stored, invalidate seen state
      const storedVersion = getStoredVersion(screenId);
      if (tour.version > (storedVersion ?? 0)) {
        markNotSeen(screenId);
        setStoredVersion(screenId, tour.version);
      }

      // Resolve i18n and build driver steps
      const steps = tour.steps
        .map((step) => {
          const i18n = resolveStepI18n(tour, step);
          const element = resolveTourElement(step.target);
          if (!element) return null;
          // Defensive: only append howTo if it's a real translation (not the raw key fallback)
          const hasHowTo =
            i18n.howTo &&
            !i18n.howTo.startsWith(`${tour.i18nPrefix}.`);
          const description = hasHowTo
            ? `${i18n.description}\n\n${i18n.howTo}`
            : i18n.description;
          return {
            element,
            popover: {
              title: i18n.title,
              description,
            },
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (steps.length === 0) {
        console.warn(`[Tour] No valid steps for screenId: ${screenId}`);
        return;
      }

      const driverInstance = createTourDriver(
        tour,
        steps,
        () => {
          // onDestroyed: cleanup only (fires for both close and done)
          driverRef.current = null;
        },
        () => {
          // onDoneClick: mark as seen only when user clicks "Done" on the last step
          markSeen(screenId);
          setStoredVersion(screenId, tour.version);
        }
      );

      driverRef.current = driverInstance;

      // Scroll first step into view BEFORE drive() so positioning math is correct
      const firstElement = (steps[0].element as unknown as { element?: HTMLElement })?.element ?? (steps[0] as unknown as { element: HTMLElement }).element;
      if (firstElement && typeof firstElement.scrollIntoView === 'function') {
        firstElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Small delay to let scroll settle before driver positions itself
      window.setTimeout(() => {
        if (driverRef.current === driverInstance) {
          driverInstance.drive();
        }
      }, 250);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      console.error('[Tour] Failed to start tour:', e);
    } finally {
      setIsLoading(false);
    }
  }, [screenId, getStoredVersion, markNotSeen, setStoredVersion, markSeen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
    };
  }, []);

  return { startTour, hasSeenTour, isLoading, error };
}
