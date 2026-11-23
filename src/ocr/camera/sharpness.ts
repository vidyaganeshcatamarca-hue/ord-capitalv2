// src/ocr/camera/sharpness.ts
// ============================================
// OCR camera — frame sharpness, for software autofocus
// ============================================
//
// The web platform gives us `focusDistance` but, on the phones tested so far,
// NOT a working `focusMode: single-shot`: asking for a focus cycle leaves the
// track on `continuous`. So the browser cannot be told "focus now".
//
// What CAN be done generically, without assuming units or distances, is measure
// the frame: move the lens through the range the device reports, and keep the
// distance whose picture is sharpest. This module is the measurement half of
// that loop; it knows nothing about cameras.
//
// The score is a normalised sum of neighbour gradients over luminance. Blur
// destroys high frequencies, so a focused receipt scores far above a soft one.
// It is deliberately cheap: it runs 6 to 8 times inside one sweep, on a small
// downscaled frame, while the operator holds the phone.

/**
 * Sharpness score of an RGBA buffer, 0 when the frame is flat.
 *
 * Only right and lower neighbours are used, so the buffer is walked once. The
 * result is divided by the pixel count: a bigger canvas does not win.
 */
export function frameSharpness(rgba: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0
  const pixels = width * height
  if (rgba.length < pixels * 4) return 0

  let total = 0
  for (let y = 0; y < height - 1; y += 1) {
    const row = y * width * 4
    const nextRow = (y + 1) * width * 4
    for (let x = 0; x < width - 1; x += 1) {
      const i = row + x * 4
      const iRight = i + 4
      const iDown = nextRow + x * 4
      // Luminance without the sRGB transfer function: for ranking frames it is
      // monotonic with the real thing and a lot cheaper.
      const l = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114
      const lRight = rgba[iRight] * 0.299 + rgba[iRight + 1] * 0.587 + rgba[iRight + 2] * 0.114
      const lDown = rgba[iDown] * 0.299 + rgba[iDown + 1] * 0.587 + rgba[iDown + 2] * 0.114
      total += Math.abs(lRight - l) + Math.abs(lDown - l)
    }
  }

  return total / pixels
}

/**
 * Candidate distances for one sweep, spread over the range the device reports.
 *
 * The units are NEVER interpreted: on one phone `focusDistance` is metres
 * (0.1..0.5), on another it is dioptres (0..10+). The sweep only needs values
 * inside the declared interval, so min and max are used as they come.
 *
 * `steps` frames are sampled inside the range, ends included, because the useful
 * distance for a receipt tends to sit near the far end.
 */
export function focusSweepCandidates(min: number, max: number, steps = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return []
  const count = Math.max(2, Math.min(10, Math.floor(steps)))
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    const value = min + ((max - min) * i) / (count - 1)
    out.push(Number(value.toFixed(4)))
  }
  return out
}
