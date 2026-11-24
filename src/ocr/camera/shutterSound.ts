// src/ocr/camera/shutterSound.ts
// ============================================
// OCR camera — shutter feedback you can HEAR
// ============================================
//
// The operator is looking at the receipt, not at the screen. The white flash
// already acknowledges the tap, but sight needs the eyes: a short click says
// "it fired" while the eyes stay on the paper.
//
// Synthesised with Web Audio instead of an audio file: no asset to bundle, no
// network request, no dependency, and it starts on the same tick as the tap
// (which is also what unlocks the audio context). A failing audio stack is
// never allowed to break a capture.
//
// THE APK, LATER
// --------------
// Same shape as `focus.ts`: this is the WEB fallback. The Android build replaces
// `createShutterFeedback()` with the native one (the camera's own shutter sound
// plus Haptics/Capacitor), and the surface keeps calling `fire()`. That is why
// the surface never imports Web Audio directly: it only knows this interface.

/** One context for the whole session: creating one per shot leaks and warns. */
let context: AudioContext | null = null;

/** Milliseconds of the click. Long enough to be heard, short enough not to lag. */
const CLICK_MS = 45;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return null;
  if (context === null) context = new Ctor();
  // A context created before any gesture starts suspended; the tap that calls
  // this is the gesture that resumes it.
  if (context.state === 'suspended') void context.resume();
  return context;
}

/**
 * The one thing the surface needs: "the shot was taken". How that reaches the
 * operator (synthesised click, native shutter, haptics) is this module's problem.
 */
export interface ShutterFeedback {
  fire: () => void
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
    const ctx = audioContext();
    if (ctx !== null && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  } catch {
    /* nothing to unlock: no sound is not an error */
  }
}

/** How long the phone buzzes with the shot. Short enough to feel like a button. */
const VIBRATE_MS = 15

/**
 * Plays the shutter click. Never throws: a phone that cannot play it still
 * captures, and the flash remains as the acknowledgement.
 */
export function playShutterSound(): void {
  try {
    const ctx = audioContext();
    if (ctx === null) return;

    /*
     * The context starts suspended until the browser sees a gesture, and starting
     * a node on a suspended context plays nothing -- silently, which is exactly
     * the bug this file shipped with. `resume()` is a promise, so the sound is
     * scheduled AFTER it settles, when the clock is actually running.
     */
    if (ctx.state !== 'running') {
      void ctx.resume().then(
        () => scheduleClick(ctx),
        () => undefined,
      );
      return;
    }
    scheduleClick(ctx);
  } catch {
    /* no sound is not an error: the capture already happened */
  }
}

/** Programs the click at the context's current time. */
function scheduleClick(ctx: AudioContext): void {
  try {
    const now = ctx.currentTime;

    // The mechanical part: a very short noise burst with a falling envelope.
    const frames = Math.max(1, Math.floor((ctx.sampleRate * CLICK_MS) / 1000));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      const t = i / frames;
      // `(1 - t)^3` is the "snap": fast decay, no tail.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.34;
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);

    // The body: a brief high tone, which is what makes it read as a camera and
    // not as a paper rustle.
    const tone = ctx.createOscillator();
    tone.type = 'square';
    tone.frequency.value = 1750;
    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.14, now);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + CLICK_MS / 1000);
    tone.connect(toneGain);
    toneGain.connect(ctx.destination);
    tone.start(now);
    tone.stop(now + CLICK_MS / 1000);
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
export function createShutterFeedback(): ShutterFeedback {
  return {
    fire: () => {
      playShutterSound();
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(VIBRATE_MS);
        }
      } catch {
        /* vibration is a bonus, never a requirement */
      }
    },
  };
}
