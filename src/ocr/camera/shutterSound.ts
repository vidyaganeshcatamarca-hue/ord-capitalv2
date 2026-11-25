// src/ocr/camera/shutterSound.ts
// ============================================
// OCR camera — shutter feedback you can HEAR
// ============================================
//
// The operator is looking at the receipt, not at the screen. The white flash
// already acknowledges the tap, but sight needs the eyes: a click says "it fired"
// while the eyes stay on the paper.
//
// TWO SOURCES, IN THIS ORDER
// -------------------------
// 1. A real recording: `public/sounds/shutter.mp3`, a Holga 120S actuation, first
//    click only. Public domain (Wikimedia Commons, by Doitashimashi), so it ships
//    inside the app with no attribution and no share-alike obligation.
// 2. A synthesised mechanism, used only when the recording cannot play: a cached
//    bundle that lost the file, a browser that refuses audio, an old device.
//
// WHERE THE FILE LIVES
// --------------------
// Web: the file is part of the app's static assets. It is fetched once from the
// hosting and then kept by the service worker, so later taps read it from the
// phone, not from the network.
// APK: the whole web bundle is packaged inside the APK, so the 4 KB file is
// installed with the app and never travels over the network at all.
//
// THE APK, LATER
// --------------
// Same shape as `focus.ts`: this is the WEB fallback. The Android build replaces
// `createShutterFeedback()` with the native shutter sound plus Haptics, and the
// surface keeps calling `fire()`.

/** The synthesised mechanisms, kept as presets and as the fallback path. */
export type ShutterVariant = 'slr' | 'press' | 'compact'

/**
 * The one thing the surface needs: "the shot was taken". How that reaches the
 * operator (recording, synthesised click, native shutter, haptics) is this
 * module's problem.
 */
export interface ShutterFeedback {
  fire: () => void
}

/** Served from `public/`, so it is one of the app's own static assets. */
const SHUTTER_FILE = '/sounds/shutter.mp3'

/** How long the phone buzzes with the shot. Short enough to feel like a button. */
const VIBRATE_MS = 15

/**
 * One prepared element for the session.
 *
 * `Audio` instead of decoding into Web Audio: `play()` on a preloading element
 * still emits as soon as its buffer exists, while `decodeAudioData` would need an
 * `await` on the first tap.
 */
let shuttered: HTMLAudioElement | null | undefined

function shutterElement(): HTMLAudioElement | null {
  if (shuttered !== undefined) return shuttered
  if (typeof Audio === 'undefined') {
    shuttered = null
    return null
  }
  const element = new Audio(SHUTTER_FILE)
  element.preload = 'auto'
  element.volume = 0.9
  shuttered = element
  return element
}

/** One context for the whole session: creating one per shot leaks and warns. */
let context: AudioContext | null = null

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
 */
export function unlockShutterAudio(): void {
  try {
    const ctx = audioContext()
    if (ctx !== null && ctx.state !== 'running') void ctx.resume().catch(() => undefined)
    // Starting the fetch of the recording here means the first tap has it ready.
    shutterElement()
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
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.72, at + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(gainValue, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + duration)
}

/** Programs the fallback click at the context's current time. */
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

/** The Web Audio path: only reached when the recording cannot play. */
function playSynthesised(variant: ShutterVariant): void {
  try {
    const ctx = audioContext()
    if (ctx === null) return
    /*
     * A context that never saw a gesture is `suspended`, and starting a node on it
     * plays nothing at all -- silently. So the click is scheduled AFTER resume()
     * settles, when the clock is actually running.
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
 * Plays the shutter. Never throws: a phone that cannot play it still captures,
 * and the flash remains as the acknowledgement.
 */
export function playShutterSound(variant: ShutterVariant = 'slr'): void {
  try {
    const element = shutterElement()
    if (element !== null) {
      // Rewind: a rapid second shot must not resume mid-file.
      element.currentTime = 0
      const played = element.play()
      if (played === undefined) return
      void played.catch(() => playSynthesised(variant))
      return
    }
  } catch {
    /* fall through to the synthesised click */
  }
  playSynthesised(variant)
}

/**
 * The web implementation of the shutter feedback: the recording plus a short
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
