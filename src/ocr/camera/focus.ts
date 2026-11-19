// src/ocr/camera/focus.ts
// ============================================
// OCR camera — focus controller (web fallback)
// ============================================
//
// WHY THIS EXISTS
// ---------------
// A receipt is photographed between 10 and 50 cm. On the phones tested, the web
// platform will not run a focus cycle on demand: asking for `focusMode:
// single-shot` leaves the track on `continuous`, so a tap cannot focus. What the
// platform DOES report is `focusDistance` as a numeric range. So the generic web
// answer is a software sweep: walk the range the device declares, measure how
// sharp the frame is at each stop, and stay where it is sharpest.
//
// WHAT IT NEVER DOES
// ------------------
// It does not assume units, distances or a device model. `focusDistance` is
// metres on one phone and dioptres on another; only `min`/`max` are used, as
// reported. A device without a usable range simply gets `supported: false` and
// keeps its own autofocus.
//
// THE APK, LATER
// --------------
// This is the WEB fallback, not the architecture. Android's CameraX/Camera2 has
// a real autofocus with tap-to-focus and a real focus distance, so the native
// build replaces ONE implementation behind this same signature. That is why the
// sweep is a standalone function taking its measurement from the caller: the
// surface never learns how focus is achieved.

import { focusSweepCandidates } from './sharpness'

export type FocusRange = { min: number; max: number }

export type FocusCapabilities = {
  /** Modes the device declares, e.g. ['manual','single-shot','continuous']. */
  modes: string[]
  /** Declared distance range, units unknown and irrelevant to the sweep. */
  range: FocusRange | null
  pointsOfInterest: boolean
}

export type FocusSweepResult =
  | { supported: true; applied: boolean; distance: number; score: number; tried: number }
  | { supported: false; reason: 'no-manual-mode' | 'no-distance-range' | 'no-track' }

export type FocusSweepOptions = {
  track: MediaStreamTrack
  /**
   * Sharpness of the CURRENT frame, from 0 up. The caller owns the video element
   * and the canvas, so the sweep stays free of DOM.
   */
  measure: () => number
  /** How long the lens is given to travel to each candidate. */
  settleMs?: number
  /** Stops inside the declared range, ends included. */
  steps?: number
  /** Injectable for tests; defaults to a real timer. */
  wait?: (ms: number) => Promise<void>
}

const DEFAULT_SETTLE_MS = 220

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })

/** What the device says it can do about focus, in one shape. */
export function readFocusCapabilities(track: MediaStreamTrack): FocusCapabilities {
  if (typeof track.getCapabilities !== 'function') {
    return { modes: [], range: null, pointsOfInterest: false }
  }
  const caps = track.getCapabilities() as MediaTrackCapabilities & {
    focusMode?: string[]
    focusDistance?: { min?: number; max?: number }
    pointsOfInterest?: unknown
  }
  const modes = Array.isArray(caps.focusMode) ? caps.focusMode : []
  const range =
    caps.focusDistance !== undefined &&
    Number.isFinite(caps.focusDistance.min) &&
    Number.isFinite(caps.focusDistance.max)
      ? { min: caps.focusDistance.min as number, max: caps.focusDistance.max as number }
      : null
  return { modes, range, pointsOfInterest: caps.pointsOfInterest !== undefined }
}

/** The distance the track is actually sitting at, when the device reports it. */
export function readFocusDistance(track: MediaStreamTrack): number | null {
  const settings = track.getSettings() as MediaTrackSettings & { focusDistance?: number }
  return typeof settings.focusDistance === 'number' ? settings.focusDistance : null
}

/**
 * Walk the declared range, keep the sharpest stop.
 *
 * Every stop is applied with `focusMode: 'manual'`; a device that ignores it
 * still returns measurements, but `applied` reports that the final distance was
 * NOT confirmed by `getSettings()`, so nobody downstream promises a focus the
 * lens never took.
 */
export async function sweepFocus(options: FocusSweepOptions): Promise<FocusSweepResult> {
  const { track, measure } = options
  if (track === undefined || track === null) return { supported: false, reason: 'no-track' }

  const caps = readFocusCapabilities(track)
  if (!caps.modes.includes('manual')) return { supported: false, reason: 'no-manual-mode' }
  if (caps.range === null) return { supported: false, reason: 'no-distance-range' }

  const candidates = focusSweepCandidates(caps.range.min, caps.range.max, options.steps ?? 6)
  if (candidates.length === 0) return { supported: false, reason: 'no-distance-range' }

  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS
  const wait = options.wait ?? sleep

  let bestDistance = candidates[0]
  // A real sharpness score can be 0 (a blank frame) or, for a normalised
  // variant, even negative: starting at -1 would silently keep the first stop.
  let bestScore = Number.NEGATIVE_INFINITY
  for (const distance of candidates) {
    try {
      await track.applyConstraints({
        advanced: [{ focusMode: 'manual', focusDistance: distance } as unknown as MediaTrackConstraintSet],
      })
    } catch {
      /* one stop the driver refuses does not invalidate the others */
    }
    await wait(settleMs)
    const score = measure()
    if (score > bestScore) {
      bestScore = score
      bestDistance = distance
    }
  }

  try {
    await track.applyConstraints({
      advanced: [
        { focusMode: 'manual', focusDistance: bestDistance } as unknown as MediaTrackConstraintSet,
      ],
    })
  } catch {
    /* reported through `applied` below */
  }

  const reached = readFocusDistance(track)
  const applied =
    reached !== null && Math.abs(reached - bestDistance) <= Math.max(0.001, Math.abs(bestDistance) * 0.02)

  return { supported: true, applied, distance: bestDistance, score: bestScore, tried: candidates.length }
}
