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
          return {
            element,
            popover: {
              title: i18n.title,
              description: `${i18n.description}\n\n${i18n.howTo}`,
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
          // onDestroyed: check if tour was finished (last step reached)
          // driver.js 1.x fires onDestroyed with state; we check via the active step index
          const activeIndex = driverInstance.getActiveIndex();
          const isFinished = activeIndex !== undefined && activeIndex >= steps.length - 1;
          if (isFinished) {
            markSeen(screenId);
            setStoredVersion(screenId, tour.version);
          }
          driverRef.current = null;
        }
      );

      driverRef.current = driverInstance;
      driverInstance.drive();
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
