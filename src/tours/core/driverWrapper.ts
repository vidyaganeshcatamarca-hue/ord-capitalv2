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
    stagePadding: 6,
    stageRadius: 8,
    smoothScroll: true,
    allowClose: true,
    allowKeyboardControl: true,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    popoverClass: 'ord-tour-popover',
    popoverOffset: 12,
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
    onDestroyed,
    onDoneClick,
  };
  return driver(config);
}
