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
  '[data-tour-id="home-billeteras-filtro"]',
  '[data-tour-id="home-misterio-alerta"]',
  '[data-tour-id="home-actividad"]',
  '[data-tour-id="home-header-aux"]',
  '[data-tour-id="home-fab-registrar"]',
] as const;

const CINEMATIC_BODY_CLASS = 'ord-tour-cinematic';
const CINEMATIC_WAITING_CLASS = 'ord-tour-step-waiting';
const CINEMATIC_POPOVER_WAITING_CLASS = 'ord-tour-popover-waiting';
const CINEMATIC_ILLUMINATED_CLASS = 'ord-tour-illuminated';
const CINEMATIC_POPOVER_VISIBLE_CLASS = 'ord-tour-popover-visible';

let cinematicTimeoutIds: ReturnType<typeof setTimeout>[] = [];
let cinematicDebugEl: HTMLDivElement | null = null;
// Multi-line debug panel for FAB step diagnosis. Updated on demand.
let fabDebugPanel: HTMLDivElement | null = null;
// rAF id of the infinite arrow-signal loop (vertical bounce). Cancelled by
// clearCinematicSequence so it stops when the step changes.
let arrowLoopRafId: number | null = null;
// The arrow element currently being animated, so clearCinematicSequence can
// reset its transform back to rest when the loop is cancelled mid-flight.
let arrowLoopEl: HTMLElement | null = null;

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
  if (fabDebugPanel) {
    fabDebugPanel.remove();
    fabDebugPanel = null;
  }
}

// Simple diagnostic: append a single short colored label so we can see
// which branches executed. Each call stacks one label vertically.
function addTag(label: string, color: string) {
  if (!fabDebugPanel) {
    fabDebugPanel = document.createElement('div');
    fabDebugPanel.style.cssText =
      'position:fixed;top:60px;left:8px;z-index:9999999;' +
      'display:flex;flex-direction:column;gap:4px;pointer-events:none;';
    document.body.appendChild(fabDebugPanel);
  }
  const tag = document.createElement('div');
  tag.textContent = label;
  tag.style.cssText =
    `padding:4px 8px;font-size:12px;font-weight:bold;color:#000;` +
    `background:${color};border-radius:4px;font-family:monospace;`;
  fabDebugPanel.appendChild(tag);
}

function clearTags() {
  if (fabDebugPanel) {
    fabDebugPanel.textContent = '';
  }
}

function clearCinematicSequence() {
  cinematicTimeoutIds.forEach(clearTimeout);
  cinematicTimeoutIds = [];
  // Stop the infinite arrow-signal loop (vertical bounce) if it is running.
  if (arrowLoopRafId !== null) {
    cancelAnimationFrame(arrowLoopRafId);
    arrowLoopRafId = null;
  }
  if (arrowLoopEl) {
    arrowLoopEl.style.transform = '';
    arrowLoopEl = null;
  }
  // Lift the bottom navigation above the tour overlays (FAB step) so the
  // user can see the whole menu bar, not only the FAB itself.
  document.querySelectorAll('.ord-tour-show-bottom-nav').forEach((el) => {
    el.classList.remove('ord-tour-show-bottom-nav');
  });
  document.body.classList.remove(CINEMATIC_WAITING_CLASS);
  document.body.classList.remove(CINEMATIC_POPOVER_WAITING_CLASS);
  document.body.classList.remove('ord-tour-fab-step');
  document.querySelectorAll(`.${CINEMATIC_ILLUMINATED_CLASS}`).forEach((el) => {
    el.classList.remove(CINEMATIC_ILLUMINATED_CLASS);
    (el as HTMLElement).style.removeProperty('box-shadow');
  });
  document.querySelectorAll('.ord-tour-illuminating').forEach((el) => {
    el.classList.remove('ord-tour-illuminating');
  });
  document.querySelectorAll('.ord-tour-illuminated-target').forEach((el) => {
    el.classList.remove('ord-tour-illuminated-target');
  });
  document.querySelectorAll(`.${CINEMATIC_POPOVER_VISIBLE_CLASS}`).forEach((el) => {
    el.classList.remove(CINEMATIC_POPOVER_VISIBLE_CLASS);
    (el as HTMLElement).style.removeProperty('opacity');
    (el as HTMLElement).style.removeProperty('visibility');
  });
  // Remove the full-dark overlay, the reveal overlay, and the parent dim
  // overlay (arrow-signal sub-step).
  document.getElementById('ord-tour-full-dark')?.remove();
  document.getElementById('ord-tour-reveal-overlay')?.remove();
  document.getElementById('ord-tour-parent-dim')?.remove();
  document.getElementById('ord-tour-fab-cap')?.remove();
  // Keep the tag panel across clearCinematicSequence calls so we can see
  // what happened in before-show. The panel is removed on tour cleanup.
  if (cinematicDebugEl) {
    cinematicDebugEl.remove();
    cinematicDebugEl = null;
  }
}

// Tracks the last popover position so intra-element transitions can
// animate the popover from the previous spot to the new one.
let lastPopoverPosition: { left: number; top: number } | null = null;

function scheduleCinematicSequence(
  stepElement: HTMLElement,
  tour: ShepherdTour,
  popoverYOffset: number = 0,
  intraMode: boolean = false,
  arrowSignalSelector?: string,
  slowDarkIn?: boolean
) {
  clearCinematicSequence();

  // Phase 1 prep
  document.body.classList.add(CINEMATIC_WAITING_CLASS);
  document.body.classList.add(CINEMATIC_POPOVER_WAITING_CLASS);
  stepElement.style.setProperty('box-shadow', 'none', 'important');

  // In intra mode we do NOT black out the screen — the parent element
  // stays visible while we light up the sub-element. In full mode we
  // add a full opaque black overlay.
// When `slowDarkIn` is true (e.g. paso 8 headerAux), the screen starts
// fully visible and dims gradually as the ring grows, leaving the lit
// area as the only visible region — like the lights going down in a
// theater.
// FAB step: keep the modal overlay but drop its z-index (see CSS rule
  // body.ord-tour-fab-step .shepherd-modal-overlay-container) so it sits
  // below the bottom-nav lift (100003). Use a semi-transparent full-dark
  // overlay (0.7) so the screen still dims, but the BottomNav's own dark
  // background reads naturally.
  const isFabStepLocal = stepElement.matches('[data-tour-id="home-fab-registrar"]');
  const skipFullDark = false;
  let fullDark: HTMLDivElement | null = null;
  let slowDarkDuration = 0;
  if (!intraMode && !skipFullDark) {
    fullDark = document.createElement('div');
    fullDark.id = 'ord-tour-full-dark';
    if (slowDarkIn) {
      slowDarkDuration = 1200;
      fullDark.style.cssText =
        `position:fixed;inset:0;background:#000;opacity:0;` +
        `z-index:99999;pointer-events:none;transition:opacity ${slowDarkDuration}ms ease-in;`;
    } else if (isFabStepLocal) {
      // FAB: half-opacity so the lifted BottomNav stays clearly readable
      // even though it sits below this overlay.
      fullDark.style.cssText =
        'position:fixed;inset:0;background:#000;opacity:0.5;' +
        'z-index:99999;pointer-events:none;transition:opacity 0.3s ease-out;';
    } else {
      fullDark.style.cssText =
        'position:fixed;inset:0;background:#000;opacity:1;' +
        'z-index:99999;pointer-events:none;transition:opacity 0.3s ease-out;';
    }
    document.body.appendChild(fullDark);
  }

  const revealDuration = 1000;
  // In intra mode we skip the initial dark pause and start everything
  // immediately: the ring grows and the popover slides at the same time.
  const illuminateAt = intraMode ? 50 : 500;
  const showPopoverAt = intraMode ? 0 : 2000;

  const t1 = setTimeout(() => {
    // Phase 2: in full mode we either fade OUT (instant full-dark → reveal)
    // or fade IN (theater-dim mode) the dark overlay. In intra mode there's
    // no overlay to manage.
    if (fullDark) {
      if (slowDarkIn) {
        // Slow fade-in: opacity 0 → 1 over `slowDarkDuration` ms, so the
        // screen dims gradually while the ring illuminates the target.
        fullDark.style.opacity = '1';
      } else {
        fullDark.style.opacity = '0';
        setTimeout(() => fullDark?.remove(), 300);
      }
    }
    document.body.classList.remove(CINEMATIC_WAITING_CLASS);
    stepElement.style.removeProperty('box-shadow');


    // Header-aux and FAB steps (theater-dim fade-in): raise the target above
    // the full-dark overlay so the buttons / icon inside the glow ring stay visible.
    if (stepElement.matches('[data-tour-id="home-header-aux"], [data-tour-id="home-fab-registrar"]')) {
      stepElement.classList.add('ord-tour-illuminated-target');
    }
    // Note: the bottom-nav lift for FAB is applied earlier in 'before-show'
    // so the menu stays visible during the slowDarkIn transition (no flicker).

// Renders a glow ring around the element that grows from the center
// outward. Used by both full and intra modes — interior gets a subtle
// mint tint so it's not darkened by Shepherd's modal overlay.
function createGlowRing(
  stepElement: HTMLElement,
  durationMs: number,
  ringElement?: HTMLElement
) {
  // When a ringElement (signal sub-element) is provided, the ring is drawn
  // around that element instead of the parent step element.
  const rectSource = ringElement ?? stepElement;
  const stepRect = rectSource.getBoundingClientRect();
  const isHeroStep = stepElement.matches('[data-tour-id="home-hero-card"]');
  const isBilleterasStep = stepElement.matches('[data-tour-id="home-billeteras"]');
  const isMisterioStep = stepElement.matches('[data-tour-id="home-misterio-alerta"]');
  const isActividadStep = stepElement.matches('[data-tour-id="home-actividad"]');
  const isHeaderAuxStep = stepElement.matches('[data-tour-id="home-header-aux"]');
  const isFabStep = stepElement.matches('[data-tour-id="home-fab-registrar"]');
  // Billeteras/misterio/actividad: ring matches the element exactly (no padding).
  // Hero: no vertical padding (tall card). Others: 40px padding.
  // Actividad gets a custom finalHeight/finalTop below (30px above, bottom of viewport).
  // Signal sub-element ring: 80px shorter vertically (padY = -40), normal
  // horizontal pad (padX = 40). Hero/billeteras special cases only apply to
  // the normal full/intra ring (no ringElement).
  const isExactRing = isBilleterasStep || isMisterioStep || isActividadStep;
  const padY = ringElement ? -40 : isExactRing ? 0 : isHeroStep ? 0 : 40;
  const padX = ringElement ? 40 : isExactRing ? 0 : 40;
  let finalWidth = stepRect.width + padX * 2;
  let finalHeight = stepRect.height + padY * 2;
  let finalLeft = stepRect.left - padX;
  let finalTop = stepRect.top - padY;
  if (!ringElement && isActividadStep) {
    // Actividad: start 30px above the element, extend to the bottom of the viewport.
    finalTop = stepRect.top - 30;
    finalHeight = window.innerHeight - finalTop;
  }
  const ring = document.createElement('div');
  ring.id = 'ord-tour-reveal-overlay';
  // Header-aux and FAB steps: the content inside the glow ring must look
  // illuminated, so use a bright radial tint and a stronger inner glow instead
  // of the default subtle mint wash that reads as dimmed against the dark overlay.
  const isIlluminatedStep = isHeaderAuxStep || isFabStep;
  const ringBackground = isIlluminatedStep
    ? 'radial-gradient(circle at center, rgba(255,255,255,0.35) 0%, rgba(78,205,196,0.22) 45%, rgba(78,205,196,0.06) 75%, rgba(78,205,196,0) 100%)'
    : 'rgba(78,205,196,0.08)';
  const ringShadow = isIlluminatedStep
    ? '0 0 64px 24px rgba(78,205,196,0.95), inset 0 0 36px 12px rgba(255,255,255,0.30)'
    : '0 0 48px 16px rgba(78,205,196,0.8),inset 0 0 24px 6px rgba(78,205,196,0.5)';
  ring.style.cssText =
    `position:fixed;top:${finalTop}px;left:${finalLeft}px;` +
    `width:0;height:0;border-radius:24px;border:3px solid #4ECDC4;` +
    `background:${ringBackground};` +
    `box-shadow:${ringShadow};` +
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
      // Arrow-signal sub-step: draw the ring around the signal element
      // (80px shorter) instead of the parent step element.
      const signalEl = arrowSignalSelector
        ? (document.querySelector(arrowSignalSelector) as HTMLElement | null)
        : null;
      createGlowRing(stepElement, 1000, signalEl ?? undefined);
      // Arrow-signal sub-step: slightly dim the parent element so the
      // signal sub-element (with its bright glow ring on top) reads as the
      // focus. The overlay sits below the ring (z-index 99999 < 100001) and
      // above the modal overlay, so the ring still glows through it.
      if (arrowSignalSelector) {
        const parentRect = stepElement.getBoundingClientRect();
        const dim = document.createElement('div');
        dim.id = 'ord-tour-parent-dim';
        dim.style.cssText =
          `position:fixed;top:${parentRect.top}px;left:${parentRect.left}px;` +
          `width:${parentRect.width}px;height:${parentRect.height}px;` +
          `background:rgba(0,0,0,0.35);border-radius:12px;` +
          `z-index:99999;pointer-events:none;`;
        document.body.appendChild(dim);
      }
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

    // Arrow-signal intra sub-step: popover stays in place (no slide), does a
    // 3-bounce in situ, and the arrow performs an ir-y-volver movement toward
    // the signaled sub-element and back to its center position.
    if (intraMode && arrowSignalSelector) {
      const pop = popover;
      const finalMarginTop = popoverYOffset + 20;
      // 3-bounce in place (reuses the same easing as the slide bounce).
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
      function animateBounceInPlace(bnow: number) {
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
        pop.style.marginTop = `${by}px`;
        if (bprogress < 1) {
          requestAnimationFrame(animateBounceInPlace);
        } else {
          pop.style.marginTop = `${finalMarginTop}px`;
          const r = pop.getBoundingClientRect();
          lastPopoverPosition = { left: r.left, top: r.top };
        }
      }
      requestAnimationFrame(animateBounceInPlace);

      // Arrow-signal: the arrow lifts up and leans back-left, then returns
      // to origin, forever while the step is shown — a "bouncing arrow" cue
      // with a slight backwards lean. Easing: ease-out going up, ease-in
      // coming back. Cancelled by clearCinematicSequence (see arrowLoopRafId).
      const signalEl = document.querySelector(arrowSignalSelector) as HTMLElement | null;
      const arrowEl = pop.querySelector('.shepherd-arrow') as HTMLElement | null;
      if (signalEl && arrowEl) {
        const arr = arrowEl;
        arrowLoopEl = arr;
        const maxOffset = 250; // how far (px) the arrow lifts straight up on each bounce
        const cycleMs = 700; // one full up-and-back cycle
        const arrowStart = performance.now();
        function animateArrowLoop(anow: number) {
          // Infinite loop: wrap the elapsed time into a 0..1 cycle phase so
          // the bounce repeats forever until clearCinematicSequence cancels it.
          const p = ((anow - arrowStart) % cycleMs) / cycleMs;
          let lift: number;
          if (p < 0.5) {
            // Going up: ease-out (decelerating toward the top).
            const lt = p / 0.5;
            lift = 1 - Math.pow(1 - lt, 2);
          } else {
            // Coming back down: ease-in (accelerating toward rest).
            const lt = (p - 0.5) / 0.5;
            lift = 1 - lt * lt;
          }
          arr.style.transform = `translate(0, ${-maxOffset * lift}px)`;
          arrowLoopRafId = requestAnimationFrame(animateArrowLoop);
        }
        arrowLoopRafId = requestAnimationFrame(animateArrowLoop);
      }
      return;
    }

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
        if (!popover) return;
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
            if (!popover) return;
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
      if (!popover) return;
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
  arrowSignalTo?: string;
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

  // The app uses an internal scroll container (not window). Find the nearest
  // ancestor of `el` that actually scrolls (scrollHeight > clientHeight).
  function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    let node: HTMLElement | null = el.parentElement;
    for (let i = 0; i < 15 && node; i++) {
      if (node.scrollHeight > node.clientHeight + 2) return node;
      node = node.parentElement;
    }
    return null;
  }

  steps.forEach((step, index) => {
    const isFirst = index === 0;
    const isLast = index === steps.length - 1;
    const isFabStep = step.element.matches('[data-tour-id="home-fab-registrar"]');
    const isHeaderAuxStep = step.element.matches('[data-tour-id="home-header-aux"]');
    const isBilleterasFiltroStep = step.element.matches('[data-tour-id="home-billeteras-filtro"]');
    const isDonutStep = step.element.matches('[data-tour-id="home-expenses-donut"]');
    const isExpensesToggleStep = step.element.matches('[data-tour-id="home-expenses-toggle-rubros"]');
    const isVerTodosStep = step.element.matches('[data-tour-id="home-expenses-ver-todos"]');
    const isMisterioStep = step.element.matches('[data-tour-id="home-misterio-alerta"]');
    const isActividadStep = step.element.matches('[data-tour-id="home-actividad"]');
    const isCinematic = isCinematicStep(step.element);
    const attachTo: NonNullable<StepOptions['attachTo']> = {
      element: step.element,
      on: (step.popover.position as PopperPlacement) || 'bottom',
    };
    const popoverClasses = [
      step.popover.className || 'ord-tour-popover',
      isDonutStep ? 'ord-tour-step-donut' : '',
    ].filter(Boolean).join(' ');
    const popoverOffset = isDonutStep ? offset(2) : isVerTodosStep ? offset({ mainAxis: 12, crossAxis: 0 }) : offset(8);
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
          if (step.element) {
            const key = step.element.dataset.tourId || step.element.id || `step-${index}`;
            const saved = savedScrollPositions.get(key);
            // Full steps: restore saved position when returning, or scroll
            // to the element on first visit. Intra steps: only restore, never
            // auto-scroll — they live inside the same card as the previous step.
            if (saved !== undefined) {
              // Restore on the REAL scroll container (not window — this app
              // scrolls inside an inner element, window.scrollY is always 0).
              const sc = findScrollContainer(step.element);
              if (sc) sc.scrollTop = saved;
            } else if (!step.intraElement && typeof step.element.scrollIntoView === 'function') {
              step.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (isActividadStep) {
              // Paso 5: scroll first visit — descend the screen content 200px
              // (viewport scrolls UP by 200px, so content moves DOWN visually).
              // This positions the section title just below the popover (which
              // sits at the top of the viewport with placement: top).
              const sc = findScrollContainer(step.element);
              if (sc) sc.scrollTop = sc.scrollTop - 200;
            }
          }
          if (isCinematic) {
            document.body.classList.add(CINEMATIC_BODY_CLASS);
            // Step 2 (donut) sits in the lower half of the page — raise
            // the popover so the buttons stay reachable.
            // Step 3 (toggle): lower 30px. Step 9 (headerAux): raise 40px
            // from previous 100px down offset. Step 10 (FAB): raise 80px.
            const popoverYOffset = isHeaderAuxStep ? 60 : isDonutStep ? -180 : isVerTodosStep ? -50 : isActividadStep ? -80 : isBilleterasFiltroStep ? -100 : isExpensesToggleStep ? 30 : isFabStep ? -80 : 0;
            // Arrow-signal sub-step: pass the selector of the element to
            // signal with the arrow ir-y-volver movement.
            const arrowSignalSelector = step.arrowSignalTo
              ? `[data-tour-id="${step.arrowSignalTo}"]`
              : undefined;
            scheduleCinematicSequence(
              step.element,
              shepherdTour,
              popoverYOffset,
              step.intraElement === true,
              arrowSignalSelector,
              isHeaderAuxStep // Only headerAux uses theater-dim fade-in.
                                // FAB relies on Shepherd's modal overlay hole
                                // to reveal the whole bottom navigation bar.
            );
            try {
              if (step.element?.matches('[data-tour-id="home-fab-registrar"]')) {
                const bottomNav = document.querySelector('.bottom-nav');
                if (bottomNav) {
                  // Lift the BottomNav above the tour overlays so the 4
                  // menu items stay visible alongside the illuminated FAB.
                  // We intentionally do NOT move the node out of #root:
                  // moving React-managed DOM breaks click handlers.
                  bottomNav.classList.add('ord-tour-show-bottom-nav');
                }
                document.body.classList.add('ord-tour-fab-step');
              }
            } catch (err) {
              addTag(`ERR ${(err as Error)?.message ?? '?'}`, '#f00');
            }
          }
        },
        'show': () => {
          // Re-apply saved scroll position AFTER Floating UI positioned the
          // popover. In before-show we set the scroll, but Shepherd /
          // Floating UI can re-trigger scroll during positioning. The 'show'
          // event fires after the popover is mounted, so a second instant
          // scroll here guarantees the viewport is at the saved position.
          if (step.element) {
            const key = step.element.dataset.tourId || step.element.id || `step-${index}`;
            const saved = savedScrollPositions.get(key);
            if (saved !== undefined) {
              const sc = findScrollContainer(step.element);
              if (sc && sc.scrollTop !== saved) sc.scrollTop = saved;
            }
          }
        },
        'before-hide': () => {
          // Save the current scroll position so we can restore it when
          // the user navigates back to this step (including intra steps).
          if (step.element) {
            const key = step.element.dataset.tourId || step.element.id || `step-${index}`;
            const sc = findScrollContainer(step.element);
            const yBefore = sc ? sc.scrollTop : window.scrollY;
            savedScrollPositions.set(key, yBefore);
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

    // FAB step: small hole around the FAB itself. The bottom navigation bar
    // is revealed separately by lifting `.bottom-nav` to z-index 100003
    // (see `.ord-tour-show-bottom-nav` CSS). The full-dark overlay is
    // skipped for FAB (see `skipFullDark`) so the bar can shine through.
    if (isFabStep) {
      stepOpts.modalOverlayOpeningRadius = 8;
      stepOpts.modalOverlayOpeningPadding = 16;
    }
    // Billeteras-filtro step: enlarge the carved hole so the wallet list
    // inside the section is fully visible (otherwise only the outer ring
    // is shown and the inside stays dimmed by Shepherd's overlay).
    if (isBilleterasFiltroStep) {
      stepOpts.modalOverlayOpeningRadius = 12;
      stepOpts.modalOverlayOpeningPadding = 32;
    }
    // Header-aux step: enlarge the carved hole so the buttons inside the
    // header actions bar stay visible (otherwise the icon buttons inside
    // the illuminated rectangle look dimmed by Shepherd's modal overlay).
    if (isHeaderAuxStep) {
      stepOpts.modalOverlayOpeningRadius = 12;
      stepOpts.modalOverlayOpeningPadding = 24;
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
