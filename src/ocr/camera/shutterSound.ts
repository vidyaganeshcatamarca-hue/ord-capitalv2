// src/ocr/camera/shutterSound.ts
// ============================================
// OCR camera — shutter feedback you can HEAR
// ============================================
//
// The operator is looking at the receipt, not at the screen. The white flash
// already acknowledges the tap, but sight needs the eyes: a click says "it fired"
// while the eyes stay on the paper.
//
// WHAT A CAMERA SOUNDS LIKE
// -------------------------
// Not a beep. A film camera has TWO mechanical events and a spring:
//   1. the mirror slaps up   -> a sharp, broadband crack (noise, a few ms)
//   2. the body of the hit   -> a low, short thump with a metallic edge
//   3. the shutter closes    -> a second, softer crack a moment later
//   4. the spring settles    -> a quiet, filtered tail
// A single oscillator reads as a microwave keypad, which is why the first version
// was rejected by ear.
//
// THE APK, LATER
// --------------
// Same shape as `focus.ts`: this is the WEB fallback. The Android build replaces
// `createShutterFeedback()` with the camera's own shutter sound plus Haptics, and
// the surface keeps calling `fire()`.

/** The three mechanisms, kept as presets so the owner can pick by ear. */
export type ShutterVariant = 'slr' | 'press' | 'compact'

/**
 * The one thing the surface needs: "the shot was taken". How that reaches the
 * operator (synthesised click, native shutter, haptics) is this module's problem.
 */
export interface ShutterFeedback {
  fire: () => void
}

/** One context for the whole session: creating one per shot leaks and warns. */
let context: AudioContext | null = null

/** How long the phone buzzes with the shot. Short enough to feel like a button. */
const VIBRATE_MS = 15

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (Ctor === undefined) return null
  if (context === null) context = new Ctor()
  return context
}

/**
 * Wakes the audio context on the FIRST gesture anywhere on the screen.
 *
 * Browsers keep a context suspended until a gesture happens, and scheduling a
 * sound in the same tick as the first gesture is a race the phone usually loses.
 * Waking it on `pointerdown` means the tap that reaches `Capturar` later finds a
 * running context.
 */
export function unlockShutterAudio(): void {
  try {
    const ctx = audioContext()
    if (ctx !== null && ctx.state !== 'running') void ctx.resume().catch(() => undefined)
  } catch {
    /* nothing to unlock: no sound is not an error */
  }
}

/** A noise burst: the mechanical crack. */
function crack(
  ctx: AudioContext,
  at: number,
  duration: number,
  gainValue: number,
  type: BiquadFilterType,
  frequency: number,
  q = 0.7,
  decay = 5,
): void {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) {
    const p = i / frames
    // A very fast decay is what makes it a "crack" and not a "shhh".
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - p, decay)
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const biquad = ctx.createBiquadFilter()
  biquad.type = type
  biquad.frequency.value = frequency
  biquad.Q.value = q
  const gain = ctx.createGain()
  gain.gain.value = gainValue
  source.connect(biquad)
  biquad.connect(gain)
  gain.connect(ctx.destination)
  source.start(at)
}

/** The body: a short, pitched thump with a falling envelope. */
function thump(
  ctx: AudioContext,
  at: number,
  frequency: number,
  duration: number,
  gainValue: number,
  type: OscillatorType,
): void {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, at)
  // A small downward glide: metal under load, not a synthesizer note.
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.72, at + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(gainValue, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + duration)
}

/**
 * Programs the click at the context's current time, for one mechanism.
 *
 *   slr     — a film SLR: two cracks with a heavy body between them.
 *   press   — a press camera: slower, deeper, more air and a longer spring.
 *   compact — a 90s compact: fast, dry, higher and much shorter.
 */
function scheduleClick(ctx: AudioContext, variant: ShutterVariant): void {
  try {
    const t = ctx.currentTime

    if (variant === 'press') {
      crack(ctx, t, 0.010, 0.34, 'lowpass', 1800, 0.6, 3)
      thump(ctx, t, 110, 0.13, 0.5, 'sine')
      thump(ctx, t, 220, 0.09, 0.16, 'triangle')
      crack(ctx, t + 0.075, 0.016, 0.26, 'bandpass', 900, 1.4, 4)
      thump(ctx, t + 0.075, 80, 0.10, 0.26, 'triangle')
      crack(ctx, t + 0.12, 0.18, 0.05, 'bandpass', 2400, 2.4, 6)
      return
    }

    if (variant === 'compact') {
      crack(ctx, t, 0.005, 0.42, 'highpass', 1600, 0.7, 7)
      thump(ctx, t, 240, 0.045, 0.3, 'triangle')
      crack(ctx, t + 0.022, 0.008, 0.26, 'bandpass', 2600, 1.6, 6)
      thump(ctx, t + 0.022, 180, 0.035, 0.16, 'triangle')
      return
    }

    // 'slr' — the default: mirror up, then the shutter closes.
    crack(ctx, t, 0.007, 0.5, 'highpass', 900, 0.7, 5)
    thump(ctx, t, 165, 0.07, 0.42, 'sine')
    thump(ctx, t, 330, 0.05, 0.14, 'triangle')
    crack(ctx, t + 0.035, 0.012, 0.3, 'bandpass', 1500, 1.2, 5)
    thump(ctx, t + 0.035, 120, 0.06, 0.22, 'triangle')
    crack(ctx, t + 0.06, 0.12, 0.055, 'bandpass', 3200, 2, 6)
  } catch {
    /* no sound is not an error: the capture already happened */
  }
}

/**
 * Plays the shutter click. Never throws: a phone that cannot play it still
 * captures, and the flash remains as the acknowledgement.
 */
export function playShutterSound(variant: ShutterVariant = 'slr'): void {
  try {
    const ctx = audioContext()
    if (ctx === null) return

    /*
     * The context starts suspended until the browser sees a gesture, and starting
     * a node on a suspended context plays nothing -- silently, which is exactly
     * the bug this file shipped with. `resume()` is a promise, so the sound is
     * scheduled AFTER it settles, when the clock is actually running.
     */
    if (ctx.state !== 'running') {
      void ctx.resume().then(
        () => scheduleClick(ctx, variant),
        () => undefined,
      )
      return
    }
    scheduleClick(ctx, variant)
  } catch {
    /* no sound is not an error: the capture already happened */
  }
}

/**
 * The web implementation of the shutter feedback: synthesised click plus a short
 * vibration, both on the tap.
 *
 * A device with neither still captures: `fire()` swallows everything.
 */
export function createShutterFeedback(variant: ShutterVariant = 'slr'): ShutterFeedback {
  return {
    fire: () => {
      playShutterSound(variant)
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(VIBRATE_MS)
        }
      } catch {
        /* vibration is a bonus, never a requirement */
      }
    },
  }
}
