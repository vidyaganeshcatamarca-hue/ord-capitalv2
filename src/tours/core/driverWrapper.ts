import Driver from 'driver.js';
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
  tour: Tour,
  steps: Driver.Step[],
  onClosed: () => void,
  onCompleted: () => void
): Driver {
  const driverInstance = new Driver({
    animate: true,
    opacity: 0.7,
    padding: 6,
    allowClose: true,
    keyboardControl: true,
    overlayClickNext: false,
    // CRITICAL: transparent stage so the highlighted element is NOT painted white.
    // The overlay (opacity 0.7 black) is what creates the dimming effect.
    stageBackground: 'transparent',
    className: 'ord-tour-popover',
    onReset: () => {
      // Called when tour ends (close button OR completed all steps)
      onClosed();
    },
    onNext: () => {
      // Called before moving to next. If no next step exists, tour ends → onReset fires too.
      const driver = (window as unknown as { ordDriver?: Driver }).ordDriver;
      if (driver && !driver.hasNextStep()) {
        onCompleted();
      }
    },
  });

  // Expose to window so onNext can check hasNextStep
  (window as unknown as { ordDriver?: Driver }).ordDriver = driverInstance;

  // driver.js 0.9.5 supports passing HTMLElement directly as `element`.
  driverInstance.defineSteps(steps);

  return driverInstance;
}
