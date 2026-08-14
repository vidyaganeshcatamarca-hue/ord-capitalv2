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

      // DEBUG: log everything about viewport, scrolling and target.
      // Goal: figure out why driver.js is positioning both stage and popover
      // with absolute coords that don't fit the viewport.
      console.log('[Tour DEBUG] Viewport', {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        documentClientWidth: document.documentElement.clientWidth,
        documentClientHeight: document.documentElement.clientHeight,
        bodyClientWidth: document.body.clientWidth,
        bodyClientHeight: document.body.clientHeight,
      });
      console.log('[Tour DEBUG] Scrolling element', {
        scrollingElement: document.scrollingElement?.tagName,
        scrollingScrollTop: document.scrollingElement?.scrollTop,
        scrollingScrollHeight: document.scrollingElement?.scrollHeight,
        documentScrollTop: document.documentElement.scrollTop,
        bodyScrollTop: document.body.scrollTop,
      });
      console.log('[Tour DEBUG] First target rect', {
        id: tour.steps[0].target,
        rect: firstEl.getBoundingClientRect(),
        offsetTop: (firstEl as HTMLElement & { offsetTop?: number }).offsetTop,
        offsetParent: (firstEl as HTMLElement & { offsetParent?: HTMLElement | null }).offsetParent?.tagName,
        computedTransform: window.getComputedStyle(firstEl).transform,
        computedPosition: window.getComputedStyle(firstEl).position,
        rectSerialized: {
          x: firstEl.getBoundingClientRect().x,
          y: firstEl.getBoundingClientRect().y,
          width: firstEl.getBoundingClientRect().width,
          height: firstEl.getBoundingClientRect().height,
          top: firstEl.getBoundingClientRect().top,
          right: firstEl.getBoundingClientRect().right,
          bottom: firstEl.getBoundingClientRect().bottom,
          left: firstEl.getBoundingClientRect().left,
        },
        parentChain: (() => {
          const chain = [];
          let p = firstEl.parentElement;
          while (p && chain.length < 6) {
            chain.push({
              tag: p.tagName,
              class: p.className.toString().split(' ').slice(0, 3).join('.'),
              overflowY: window.getComputedStyle(p).overflowY,
              transform: window.getComputedStyle(p).transform,
              position: window.getComputedStyle(p).position,
            });
            p = p.parentElement;
          }
          return chain;
        })(),
      });

      // Small delay to let scroll settle, then start tour
      window.setTimeout(() => {
        if (driverRef.current === driverInstance) {
          driverInstance.start();
        }

        // driver.js 0.9.5 has ANIMATION_DURATION_MS = 300 and its
        // computed position math assumes the global scroll is on
        // window/documentElement, but our app scrolls on `.page`.
        // Wait for the 3 nodes (overlay, stage, popover) to exist, then
        // override their inline styles with viewport-relative coords
        // derived from the target's actual getBoundingClientRect().
        const deadline = Date.now() + 2500;
        const tryOverride = () => {
          const stage = document.getElementById('driver-highlighted-element-stage');
          const popover = document.getElementById('driver-popover-item');
          const overlay = document.querySelector('.driver-overlay');
          if (!stage || !popover || !overlay) {
            if (Date.now() < deadline) {
              window.requestAnimationFrame(tryOverride);
            } else {
              console.warn('[Tour DEBUG] Override timed out waiting for driver.js nodes');
            }
            return;
          }

          const padding = 8;
          // The target may have moved between scrollIntoView and now;
          // re-read its rect inside the override.
          const targetRect = firstEl.getBoundingClientRect();
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const popoverWidth = 320;
          const popoverMargin = 12;

          stage.style.cssText =
            `display: block !important;` +
            `position: fixed !important;` +
            `left: ${Math.max(0, targetRect.left - padding)}px !important;` +
            `top: ${Math.max(0, targetRect.top - padding)}px !important;` +
            `width: ${Math.min(vw - padding * 2, targetRect.width + padding * 2)}px !important;` +
            `height: ${targetRect.height + padding * 2}px !important;` +
            `background-color: transparent !important;` +
            `z-index: 10000 !important;` +
            `box-shadow: 0 0 0 9999px rgba(0,0,0,0.7) !important;`;

          overlay.setAttribute(
            'style',
            `display: block !important;` +
              `position: fixed !important;` +
              `inset: 0 !important;` +
              `background: rgba(0,0,0,0.7) !important;` +
              `z-index: 9999 !important;` +
              `pointer-events: none !important;`
          );

          popover.style.cssText =
            `display: block !important;` +
            `position: fixed !important;` +
            `top: 60px !important;` +
            `left: 50% !important;` +
            `transform: translateX(-50%) !important;` +
            `width: ${popoverWidth}px !important;` +
            `max-width: calc(100vw - ${popoverMargin * 2}px) !important;` +
            `z-index: 10001 !important;` +
            `background-color: var(--surface, #2D2D2D) !important;` +
            `color: var(--text-primary, #FFFFFF) !important;`;

          console.log('[Tour DEBUG] After override (success)', {
            targetRect,
            vw,
            vh,
            stageRect: stage.getBoundingClientRect(),
            popoverRect: popover.getBoundingClientRect(),
            overlayRect: overlay.getBoundingClientRect(),
          });
        };
        tryOverride();
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
