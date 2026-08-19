import Shepherd, { type Tour as ShepherdTour, type StepOptions, type PopperPlacement, type StepOptionsButton } from 'shepherd.js';
import { offset } from '@floating-ui/dom';
import 'shepherd.js/dist/css/shepherd.css';
import type { Tour } from '../types';
import { t } from '@/locales/i18n';
import '@/components/Tour/TourPopover.css';

export function resolveTourElement(id: string): HTMLElement | null {
  const el = document.querySelector(`[data-tour-id="${id}"]`);
  if (!el && import.meta.env.DEV) {
    console.warn(`[Tour] Element with data-tour-id="${id}" not found in DOM`);
  }
  return el as HTMLElement | null;
}

/**
 * Selectors for the steps that use the 3-phase cinematic cascade
 * (dim → oval ring → popover emerges). ~3.3s per step:
 *   dim 0–0.25s, oval ring 1.5–2.4s, popover 2.6–3.3s.
 * Other steps keep the default fast pulse + fast popover appear.
 */
const CINEMATIC_STEP_SELECTORS = [
  '[data-tour-id="home-hero-card"]',
  '[data-tour-id="home-expenses-donut"]',
  '[data-tour-id="home-expenses-toggle-rubros"]',
  '[data-tour-id="home-expenses-ver-todos"]',
  '[data-tour-id="home-billeteras"]',
] as const;

const CINEMATIC_BODY_CLASS = 'ord-tour-cinematic';
const CINEMATIC_WAITING_CLASS = 'ord-tour-step-waiting';
const CINEMATIC_POPOVER_WAITING_CLASS = 'ord-tour-popover-waiting';
const CINEMATIC_ILLUMINATED_CLASS = 'ord-tour-illuminated';
const CINEMATIC_POPOVER_VISIBLE_CLASS = 'ord-tour-popover-visible';

let cinematicTimeoutIds: ReturnType<typeof setTimeout>[] = [];
let cinematicDebugEl: HTMLDivElement | null = null;

function showDebugIndicator(text: string, bg: string) {
  if (!cinematicDebugEl) {
    cinematicDebugEl = document.createElement('div');
    cinematicDebugEl.style.cssText =
      'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9999999;' +
      'padding:6px 16px;font-size:14px;font-weight:bold;color:#fff;border-radius:0 0 10px 10px;' +
      'font-family:monospace;pointer-events:none;';
    document.body.appendChild(cinematicDebugEl);
  }
  cinematicDebugEl.style.background = bg;
  cinematicDebugEl.textContent = text;
}

function removeDebugIndicator() {
  if (cinematicDebugEl) {
    cinematicDebugEl.remove();
    cinematicDebugEl = null;
  }
}

function clearCinematicSequence() {
  cinematicTimeoutIds.forEach(clearTimeout);
  cinematicTimeoutIds = [];
  document.body.classList.remove(CINEMATIC_WAITING_CLASS);
  document.body.classList.remove(CINEMATIC_POPOVER_WAITING_CLASS);
  document.querySelectorAll(`.${CINEMATIC_ILLUMINATED_CLASS}`).forEach((el) => {
    el.classList.remove(CINEMATIC_ILLUMINATED_CLASS);
    (el as HTMLElement).style.removeProperty('box-shadow');
  });
  document.querySelectorAll('.ord-tour-illuminating').forEach((el) => {
    el.classList.remove('ord-tour-illuminating');
  });
  document.querySelectorAll(`.${CINEMATIC_POPOVER_VISIBLE_CLASS}`).forEach((el) => {
    el.classList.remove(CINEMATIC_POPOVER_VISIBLE_CLASS);
    (el as HTMLElement).style.removeProperty('opacity');
    (el as HTMLElement).style.removeProperty('visibility');
  });
  // Remove the full-dark overlay and the reveal overlay
  document.getElementById('ord-tour-full-dark')?.remove();
  document.getElementById('ord-tour-reveal-overlay')?.remove();
  removeDebugIndicator();
}

// Tracks the last popover position so intra-element transitions can
// animate the popover from the previous spot to the new one.
let lastPopoverPosition: { left: number; top: number } | null = null;

function scheduleCinematicSequence(
  stepElement: HTMLElement,
  tour: ShepherdTour,
  popoverYOffset: number = 0,
  intraMode: boolean = false
) {
  clearCinematicSequence();

  // Phase 1 prep
  document.body.classList.add(CINEMATIC_WAITING_CLASS);
  document.body.classList.add(CINEMATIC_POPOVER_WAITING_CLASS);
  stepElement.style.setProperty('box-shadow', 'none', 'important');

  // In intra mode we do NOT black out the screen — the parent element
  // stays visible while we light up the sub-element. In full mode we
  // add a full opaque black overlay.
  let fullDark: HTMLDivElement | null = null;
  if (!intraMode) {
    fullDark = document.createElement('div');
    fullDark.id = 'ord-tour-full-dark';
    fullDark.style.cssText =
      'position:fixed;inset:0;background:#000;opacity:1;' +
      'z-index:99999;pointer-events:none;transition:opacity 0.3s ease-out;';
    document.body.appendChild(fullDark);
  }

  const revealDuration = 1000;
  // In intra mode we skip the initial dark pause and start everything
  // immediately: the ring grows and the popover slides at the same time.
  const illuminateAt = intraMode ? 50 : 500;
  const showPopoverAt = intraMode ? 0 : 2000;

  const t1 = setTimeout(() => {
    // Phase 2: remove the full-dark overlay (full mode only), then
    // reveal the element. In intra mode there's no overlay to remove.
    if (fullDark) {
      fullDark.style.opacity = '0';
      setTimeout(() => fullDark?.remove(), 300);
    }
    document.body.classList.remove(CINEMATIC_WAITING_CLASS);
    stepElement.style.removeProperty('box-shadow');

// Renders a glow ring around the element that grows from the center
// outward. Used by both full and intra modes — interior gets a subtle
// mint tint so it's not darkened by Shepherd's modal overlay.
function createGlowRing(
  stepElement: HTMLElement,
  durationMs: number
) {
  const stepRect = stepElement.getBoundingClientRect();
  const isHeroStep = stepElement.matches('[data-tour-id="home-hero-card"]');
  const isBilleterasStep = stepElement.matches('[data-tour-id="home-billeteras"]');
  // Hero & billeteras cards are already tall — less vertical padding.
  const padY = isHeroStep ? 0 : isBilleterasStep ? 25 : 40;
  const padX = 40;
  const finalWidth = stepRect.width + padX * 2;
  const finalHeight = stepRect.height + padY * 2;
  const finalLeft = stepRect.left - padX;
  const finalTop = stepRect.top - padY;
  const ring = document.createElement('div');
  ring.id = 'ord-tour-reveal-overlay';
  ring.style.cssText =
    `position:fixed;top:${finalTop}px;left:${finalLeft}px;` +
    `width:0;height:0;border-radius:24px;border:3px solid #4ECDC4;` +
    `background:rgba(78,205,196,0.08);` +
    `box-shadow:0 0 48px 16px rgba(78,205,196,0.8),inset 0 0 24px 6px rgba(78,205,196,0.5);` +
    `z-index:100001;pointer-events:none;opacity:0;`;
  document.body.appendChild(ring);

  const ringStart = performance.now();
  function animateRing(rnow: number) {
    const elapsed = rnow - ringStart;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentWidth = finalWidth * eased;
    const currentHeight = finalHeight * eased;
    ring.style.width = `${currentWidth}px`;
    ring.style.height = `${currentHeight}px`;
    ring.style.top = `${finalTop + (finalHeight - currentHeight) / 2}px`;
    ring.style.left = `${finalLeft + (finalWidth - currentWidth) / 2}px`;
    ring.style.opacity = `${Math.min(progress * 2, 1)}`;
    if (progress < 1) {
      requestAnimationFrame(animateRing);
    } else {
      ring.style.width = `${finalWidth}px`;
      ring.style.height = `${finalHeight}px`;
      ring.style.top = `${finalTop}px`;
      ring.style.left = `${finalLeft}px`;
      ring.style.opacity = '1';
    }
  }
  requestAnimationFrame(animateRing);
}

if (intraMode) {
      // Intra mode: glow ring grows from center outward immediately.
      createGlowRing(stepElement, 1000);
      return;
    }

    // Full mode: same glow ring grows from center outward (matches intra).
    createGlowRing(stepElement, revealDuration);
  }, illuminateAt);

  const t2 = setTimeout(() => {
    // Phase 3: show the popover.
    document.body.classList.remove(CINEMATIC_POPOVER_WAITING_CLASS);
    const currentStep = tour.getCurrentStep();
    const popover = (currentStep?.getElement?.() ?? document.querySelector('.shepherd-enabled.shepherd-element')) as HTMLElement | null;
    if (!popover) return;

    popover.style.removeProperty('opacity');
    popover.style.removeProperty('visibility');
    popover.classList.remove(CINEMATIC_POPOVER_VISIBLE_CLASS);
    popover.classList.add(CINEMATIC_POPOVER_VISIBLE_CLASS);

    if (intraMode && lastPopoverPosition) {
      // Intra mode: slide from last position, then 3-bounce at destination.
      const newRect = popover.getBoundingClientRect();
      const finalMarginTop = popoverYOffset + 20;
      const startMarginTop = lastPopoverPosition.top - newRect.top;
      popover.style.marginTop = `${startMarginTop}px`;

      // Phase A: slide (700ms)
      const slideStart = performance.now();
      const slideDuration = 700;
      function animateSlide(now: number) {
        const elapsed = now - slideStart;
        const progress = Math.min(elapsed / slideDuration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentMargin = startMarginTop + (finalMarginTop - startMarginTop) * eased;
        popover.style.marginTop = `${currentMargin}px`;
        if (progress < 1) {
          requestAnimationFrame(animateSlide);
        } else {
          // Phase B: 3-bounce at destination
          const bounceStart = performance.now();
          const bounceDuration = 900;
          const bounces = [
            { at: 0.10, y: finalMarginTop },
            { at: 0.25, y: finalMarginTop - 18 },
            { at: 0.35, y: finalMarginTop },
            { at: 0.50, y: finalMarginTop - 10 },
            { at: 0.60, y: finalMarginTop },
            { at: 0.72, y: finalMarginTop - 5 },
            { at: 0.82, y: finalMarginTop },
            { at: 1.00, y: finalMarginTop },
          ];
          function animateBounce(bnow: number) {
            const belapsed = bnow - bounceStart;
            const bprogress = Math.min(belapsed / bounceDuration, 1);
            let by = finalMarginTop;
            for (let i = 0; i < bounces.length - 1; i++) {
              if (bprogress >= bounces[i].at && bprogress <= bounces[i + 1].at) {
                const localT = (bprogress - bounces[i].at) / (bounces[i + 1].at - bounces[i].at);
                const eased2 = localT < 0.5
                  ? 2 * localT * localT
                  : 1 - Math.pow(-2 * localT + 2, 2) / 2;
                by = bounces[i].y + (bounces[i + 1].y - bounces[i].y) * eased2;
                break;
              }
            }
            popover.style.marginTop = `${by}px`;
            if (bprogress < 1) {
              requestAnimationFrame(animateBounce);
            } else {
              popover.style.marginTop = `${finalMarginTop}px`;
              const finalRect = popover.getBoundingClientRect();
              lastPopoverPosition = { left: finalRect.left, top: finalRect.top };
            }
          }
          requestAnimationFrame(animateBounce);
        }
      }
      requestAnimationFrame(animateSlide);
      return;
    }

    // Full mode: 3-bounce drop.
    const startTime = performance.now();
    const duration = 1200;
    const bounces = [
      { at: 0.10, y: popoverYOffset },
      { at: 0.25, y: popoverYOffset - 22 },
      { at: 0.35, y: popoverYOffset },
      { at: 0.50, y: popoverYOffset - 13 },
      { at: 0.60, y: popoverYOffset },
      { at: 0.72, y: popoverYOffset - 6 },
      { at: 0.82, y: popoverYOffset },
      { at: 1.00, y: popoverYOffset },
    ];
    function animateBounce(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      let y = popoverYOffset;
      for (let i = 0; i < bounces.length - 1; i++) {
        if (progress >= bounces[i].at && progress <= bounces[i + 1].at) {
          const localT = (progress - bounces[i].at) / (bounces[i + 1].at - bounces[i].at);
          const eased = localT < 0.5
            ? 2 * localT * localT
            : 1 - Math.pow(-2 * localT + 2, 2) / 2;
          y = bounces[i].y + (bounces[i + 1].y - bounces[i].y) * eased;
          break;
        }
      }
popover.style.marginTop = `${y}px`;
        if (progress < 1) {
          requestAnimationFrame(animateBounce);
        } else {
          popover.style.marginTop = `${popoverYOffset}px`;
          // Capture the actual visual position (getBoundingClientRect
          // already reflects margin-top — don't add popoverYOffset again).
          const r = popover.getBoundingClientRect();
          lastPopoverPosition = { left: r.left, top: r.top };
        }
    }
    requestAnimationFrame(animateBounce);
  }, showPopoverAt);

  cinematicTimeoutIds.push(t1, t2);
}

function hidePopoverInline() {
  // Called from the tour 'show' event — after Shepherd has rendered the
  // popover, force-hide it via inline styles so it doesn't appear before
  // the scheduled t2 timeout.
  const popover = document.querySelector('.shepherd-enabled.shepherd-element') as HTMLElement | null;
  if (popover) {
    popover.style.setProperty('opacity', '0', 'important');
    popover.style.setProperty('visibility', 'hidden', 'important');
  }
}

function isCinematicStep(element: HTMLElement): boolean {
  return CINEMATIC_STEP_SELECTORS.some((selector) => element.matches(selector));
}

type TourStep = {
  element: HTMLElement;
  popover: { title: string; description: string; position?: string; className?: string };
  intraElement?: boolean;
};

export function createTourDriver(
  tour: Tour,
  steps: TourStep[],
  onClosed: () => void,
  onCompleted: () => void
): ShepherdTour {
  const shepherdTour = new Shepherd.Tour({
    // Force the modal overlay container to be a direct child of <body>,
    // so it sits OUTSIDE #root (which has overflow: hidden) and is not
    // clipped or hidden by app-level z-indexes.
    modalContainer: document.body,
    useModalOverlay: true,
    defaultStepOptions: {
      scrollTo: { behavior: 'smooth', block: 'center' },
      cancelIcon: { enabled: true },
      classes: 'ord-tour-popover',
      // Small offset so the popover stays close to (raised toward) the
      // target — a large offset pushed the popover off-viewport and the
      // Back/Next buttons out of reach on mobile.
      floatingUIOptions: {
        middleware: [offset(8)],
      },
      // Always show the arrow so users see which element the popover refers to.
      arrow: true,
      // The pulse animation for the highlighted target.
      highlightClass: 'ord-tour-highlight',
    },
  });

  // Per-step scroll position map. When navigating forward, we scroll the
  // target into view; when navigating back, we restore the saved
  // position so the user returns to where the element was.
  const savedScrollPositions = new Map<string, number>();

  steps.forEach((step, index) => {
    const isFirst = index === 0;
    const isLast = index === steps.length - 1;
    const isFabStep = step.element.matches('[data-tour-id="home-fab-registrar"]');
    const isDonutStep = step.element.matches('[data-tour-id="home-expenses-donut"]');
    const isVerTodosStep = step.element.matches('[data-tour-id="home-expenses-ver-todos"]');
    const isCinematic = isCinematicStep(step.element);
    const attachTo: NonNullable<StepOptions['attachTo']> = {
      element: step.element,
      on: (step.popover.position as PopperPlacement) || 'bottom',
    };
    const popoverClasses = [
      step.popover.className || 'ord-tour-popover',
      isDonutStep ? 'ord-tour-step-donut' : '',
    ].filter(Boolean).join(' ');
    const popoverOffset = isDonutStep ? offset(2) : isVerTodosStep ? offset({ mainAxis: 12, crossAxis: -80 }) : offset(8);
    const stepButtons: StepOptionsButton[] = [
      {
        text: t('btn_back'),
        action: () => shepherdTour.back(),
        classes: 'ord-tour-btn ord-tour-btn-secondary',
      },
      {
        text: isLast ? t('btn_understood') : t('btn_next'),
        action: () => shepherdTour.next(),
        classes: 'ord-tour-btn ord-tour-btn-primary',
      },
    ];

    if (isFirst) {
      stepButtons.shift();
    }

    const stepOpts: StepOptions = {
      id: step.element.id || `step-${index}`,
      title: step.popover.title,
      text: step.popover.description,
      attachTo,
      classes: popoverClasses,
      buttons: stepButtons,
      // In intra mode the screen stays put (no scroll) so the user can
      // see the parent element while the sub-element lights up.
      scrollTo: !step.intraElement,
      arrow: true,
      floatingUIOptions: {
        middleware: [popoverOffset],
      },
      when: {
        'before-show': () => {
          // Intra mode: no scroll — screen stays put.
          // Full mode: restore saved scroll position when returning
          // (already-visited step) or scroll to the element on first visit.
          if (!step.intraElement && step.element) {
            const key = step.element.id || `step-${index}`;
            const saved = savedScrollPositions.get(key);
            if (saved !== undefined) {
              window.scrollTo({ top: saved, behavior: 'smooth' });
            } else if (typeof step.element.scrollIntoView === 'function') {
              step.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
          if (isCinematic) {
            document.body.classList.add(CINEMATIC_BODY_CLASS);
            // Step 2 (donut) sits in the lower half of the page — raise
            // the popover so the buttons stay reachable.
            const popoverYOffset = isDonutStep ? -180 : isVerTodosStep ? -50 : 0;
            scheduleCinematicSequence(
              step.element,
              shepherdTour,
              popoverYOffset,
              step.intraElement === true
            );
          }
        },
        'before-hide': () => {
          // Save the current scroll position so we can restore it when
          // the user navigates back to this step.
          if (!step.intraElement) {
            const key = step.element.id || `step-${index}`;
            savedScrollPositions.set(key, window.scrollY);
          }
          // Cancel the scheduled cinematic reveal and strip all classes so
          // the next step starts from a clean state.
          if (isCinematic) {
            document.body.classList.remove(CINEMATIC_BODY_CLASS);
            clearCinematicSequence();
          }
        },
      },
    };

    // FAB step: round the carved hole so the highlight forms a perfect circle
    // around the "+" button (instead of a small square that misses the icon).
    if (isFabStep) {
      stepOpts.modalOverlayOpeningRadius = 9999;
      stepOpts.modalOverlayOpeningPadding = 16;
    }

    shepherdTour.addStep(stepOpts);
  });

  // After Shepherd renders the popover (the 'show' event fires AFTER the
  // popover exists in the DOM), force-hide it via inline styles so it
  // stays invisible until the scheduled t2 timeout in the cinematic
  // sequence. This catches the popover even if beforeShow ran too late.
  shepherdTour.on('show', () => {
    // Check whether the CURRENT step's target is cinematic — do NOT rely
    // on the body class alone, because if before-show failed to fire the
    // class would be absent and this safety net would be dead too.
    const currentStepEl = shepherdTour.getCurrentStep()?.getElement() as HTMLElement | undefined;
    if (currentStepEl && isCinematicStep(currentStepEl)) {
      hidePopoverInline();
    }
  });

  shepherdTour.on('complete', () => {
    // Safety net: if the tour ends mid-cinematic, make sure the class
    // doesn't leak into the next session of the app.
    document.body.classList.remove(CINEMATIC_BODY_CLASS);
    clearCinematicSequence();
    lastPopoverPosition = null;
    savedScrollPositions.clear();
    onCompleted();
  });
  shepherdTour.on('cancel', () => {
    document.body.classList.remove(CINEMATIC_BODY_CLASS);
    clearCinematicSequence();
    lastPopoverPosition = null;
    savedScrollPositions.clear();
    onClosed();
  });

  return shepherdTour;
}
