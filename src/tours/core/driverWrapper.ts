import { driver, type Driver, type DriveStep, type Config } from 'driver.js';
import type { Tour } from '../types';
import '@/components/Tour/TourPopover.css';

export function resolveTourElement(id: string): HTMLElement | null {
  const el = document.querySelector(`[data-tour-id="${id}"]`);
  if (!el && import.meta.env.DEV) {
    console.warn(`[Tour] Element with data-tour-id="${id}" not found in DOM`);
  }
  return el as HTMLElement | null;
}

/**
 * Manually position the popover inside the viewport, overriding driver.js's
 * default positioning math. We compute target rect via getBoundingClientRect,
 * pick a side based on target's vertical position, then clamp horizontally
 * so the popover never overflows the viewport.
 */
function positionPopoverManually(popover: unknown): void {
  const el = popover as unknown as HTMLElement;
  if (!el || typeof el.getBoundingClientRect !== 'function') return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const padding = 12;

  // The element currently highlighted is stored by driver.js but easiest path
  // is to read the active highlight via querySelector.
  const activeEl = document.querySelector('.driver-active-element') as HTMLElement | null;
  if (!activeEl) return;

  const targetRect = activeEl.getBoundingClientRect();

  // Decide vertical side: if target is in the top half of viewport, place below;
  // otherwise place above. Fallback: use bottom 1/3 of viewport.
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const placeBelow = targetCenterY < vh / 2;

  // Reset inline positioning from driver.js
  el.style.top = '';
  el.style.bottom = '';
  el.style.left = '';
  el.style.right = '';
  el.style.transform = '';

  // Set max width based on viewport
  const maxWidth = Math.min(360, vw - padding * 2);
  el.style.maxWidth = `${maxWidth}px`;
  el.style.width = `${maxWidth}px`;

  // Compute horizontal center, clamped to viewport
  const desiredCenterX = targetRect.left + targetRect.width / 2;
  const halfW = maxWidth / 2;
  let leftPx = desiredCenterX - halfW;
  if (leftPx < padding) leftPx = padding;
  if (leftPx + maxWidth > vw - padding) leftPx = vw - maxWidth - padding;
  el.style.left = `${leftPx}px`;

  // Position vertically
  if (placeBelow) {
    const topPx = targetRect.bottom + 12;
    el.style.top = `${topPx}px`;
    el.style.maxHeight = `${vh - topPx - padding}px`;
  } else {
    const bottomPx = vh - targetRect.top + 12;
    el.style.bottom = `${bottomPx}px`;
    el.style.maxHeight = `${targetRect.top - padding - 12}px`;
  }

  // Hide driver.js built-in arrow since we manage positioning entirely
  const arrow = el.querySelector('.driver-popover-arrow') as HTMLElement | null;
  if (arrow) arrow.style.display = 'none';
}

export function createTourDriver(
  _tour: Tour,
  steps: DriveStep[],
  onDestroyed: () => void,
  onDoneClick?: () => void
): Driver {
  const config: Config = {
    steps,
    animate: true,
    duration: 300,
    overlayOpacity: 0.7,
    overlayColor: '#1A1A1A',
    stagePadding: 8,
    stageRadius: 8,
    smoothScroll: true,
    allowClose: true,
    allowKeyboardControl: true,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    popoverClass: 'ord-tour-popover',
    waitForElement: 600,
    onHighlighted: (element) => {
      // Force element into view with smooth scroll if it isn't already visible
      if (element && typeof element.scrollIntoView === 'function') {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!isVisible) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    },
    onPopoverRender: (popover) => {
      // Defer to next frame so DOM has measured sizes
      window.requestAnimationFrame(() => positionPopoverManually(popover));
    },
    onDestroyed,
    onDoneClick,
  };
  return driver(config);
}
