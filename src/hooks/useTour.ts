import { useState, useEffect, useRef, useCallback } from 'react';
import type { TourScreenId } from '@/tours/ids';
import { useTourProgress } from './useTourProgress';
import { loadTour } from '@/tours/registry';
import { resolveStepI18n } from '@/tours/core/i18nResolver';
import { createTourDriver, resolveTourElement } from '@/tours/core/driverWrapper';
import type Driver from 'driver.js';

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

      // Build driver.js 0.9.5 steps. Element is HTMLElement directly (not selector).
      const steps: Array<{
        element: HTMLElement;
        popover: { title: string; description: string; position?: string; className?: string };
      }> = [];

      tour.steps.forEach((step) => {
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
            className: 'ord-tour-popover',
          },
        });
      });

      if (steps.length === 0) {
        console.warn(`[Tour] No valid steps for screenId: ${screenId}`);
        return;
      }

      const driverInstance = createTourDriver(
        tour,
        steps,
        () => {
          // onClosed: cleanup only
          driverRef.current = null;
        },
        () => {
          // onCompleted: mark as seen when user completes last step
          markSeen(screenId);
          setStoredVersion(screenId, tour.version);
        }
      );

      driverRef.current = driverInstance;

      // Scroll first element into view BEFORE starting tour so positioning math is correct
      const firstEl = steps[0].element;
      if (firstEl && typeof firstEl.scrollIntoView === 'function') {
        firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Small delay to let scroll settle, then start tour
      window.setTimeout(() => {
        if (driverRef.current === driverInstance) {
          driverInstance.start();
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
      if (driverRef.current && typeof driverRef.current.reset === 'function') {
        driverRef.current.reset(true);
        driverRef.current = null;
      }
    };
  }, []);

  return { startTour, hasSeenTour, isLoading, error };
}
