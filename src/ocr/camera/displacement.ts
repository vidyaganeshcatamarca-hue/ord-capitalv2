/**
 * Vertical displacement meter for the camera-batch spike.
 *
 * Supermarket receipts are visually homogeneous: a 20% band of the previous
 * photo holds a dozen near-identical lines, so the eye has nothing to match.
 * This module turns the live frames into ONE number — how far the camera
 * travelled down the receipt — so the page can show a meter instead of asking
 * the operator to eyeball the alignment.
 *
 * Deliberately pure: a flat array of RGBA bytes and a row count in, plain
 * numbers out. No DOM, no canvas, no dependency, so it is testable with plain
 * node (see `tests/camera_batch_displacement.test.js`).
 *
 * TWO MEASUREMENTS, NOT ONE (this is what the field failure taught us):
 * `estimateVerticalShift` answers only for ONE pair of neighbour frames, over a
 * narrow search window, and `accumulateTravel` turns that pair into a running
 * offset. Measuring every frame against a fixed reference over a wide window
 * gave dozens of near-identical correlation peaks on a repetitive receipt, so
 * the answer jumped between arbitrary lines and the percentage fell back to 0.
 *
 * SIGN CONVENTION (kept by every function and by the page):
 * `estimateVerticalShift(prev, curr, maxShift)` returns `shift` such that
 *
 *     prev[i] ≈ curr[i + shift]
 *
 * A POSITIVE shift means the image content slid DOWN the screen: the user moved
 * the camera UP the receipt, backwards. A NEGATIVE shift means the content slid
 * UP the screen: the user moved the camera DOWN the receipt, which is the
 * direction that makes progress in this spike.
 *
 * NET TRAVEL, NOT A RATCHET: the offset follows the camera in BOTH directions.
 * Moving away from the last capture adds, coming back subtracts. An earlier
 * version only ever added, which produced a FALSE "ready": go 70% down,
 * overshoot, come back 25%, and the meter still claimed 70% while the overlap
 * the next photo needed was no longer there. Net travel is what decides whether
 * two consecutive photos share enough lines, so net travel is what is measured.
 *
 * ACCEPTED INACCURACY: this is an ADVISORY bar, not a measurement of record.
 * On a repetitive receipt (a dozen near-identical lines) the correlation peak
 * can jump one line, so the reported travel may be off by a line height. That
 * is deliberate: the alternative is refusing to answer exactly in the case the
 * bar exists for. There is no second-peak test anymore for that reason, and the
 * confidence floor is low enough that a homogeneous frame still answers.
 */

/** Rec. 601 luminance weights: green dominates, red and blue follow. */
const LUMA_R = 0.299
const LUMA_G = 0.587
const LUMA_B = 0.114

/** Below this many overlapping rows a correlation is noise, not a measurement. */
const MIN_OVERLAP_ROWS = 16

/**
 * Hand tremor, not travel: a single row of movement can be the paper wobbling
 * in the operator's hands rather than the camera travelling, so it is ignored
 * instead of accumulated. The band is deliberately ONE row: at two rows every
 * slow step of a real walk was swallowed, which made the meter undercount and
 * let it show 50% when the physical overlap was already there. Two rows or more
 * is a measurement.
 */
const JITTER_ROWS = 1

/**
 * Below this the match is not a match and the function answers `null`.
 *
 * Kept low ON PURPOSE: a repetitive receipt has several near-equal peaks, so a
 * strict floor would return `null` for most frames of the exact scenario this
 * meter was built for. 0.35 lets a homogeneous frame answer, and the caller is
 * expected to keep showing its last reading instead of hiding the bar.
 */
const CONFIDENCE_FLOOR = 0.35

/** Guards the denominator of the normalised correlation against flat bands. */
const VARIANCE_EPSILON = 1e-9

/**
 * Average luminance per row, normalised to 0..1, one entry per row.
 *
 * `data` is the RGBA byte array of a canvas `getImageData` call; only the three
 * colour channels are read, alpha is ignored (the sampler never draws anything
 * transparent). A byte array shorter than `width * height * 4` yields a shorter
 * profile instead of throwing: a half-copied frame must not break the flow.
 */
export function verticalProfile(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const columns = Math.floor(width)
  const declaredRows = Math.floor(height)
  if (!Number.isFinite(columns) || !Number.isFinite(declaredRows)) return new Float32Array(0)
  if (columns <= 0 || declaredRows <= 0) return new Float32Array(0)

  const bytesPerRow = columns * 4
  const rows = Math.min(declaredRows, Math.floor(data.length / bytesPerRow))
  const profile = new Float32Array(Math.max(0, rows))

  for (let y = 0; y < rows; y++) {
    const rowStart = y * bytesPerRow
    let total = 0
    for (let x = 0; x < columns; x++) {
      const offset = rowStart + x * 4
      total += data[offset] * LUMA_R + data[offset + 1] * LUMA_G + data[offset + 2] * LUMA_B
    }
    const luminance = total / columns
    // Clamped so a caller can never receive a value outside the 0..1 contract.
    profile[y] = Math.min(1, Math.max(0, luminance / 255))
  }

  return profile
}

/**
 * Converts accumulated offset rows into the percentage shown to the operator.
 *
 * `calibration` exists because the measured travel is not the physical travel:
 * frame-to-frame correlation under-counts or over-counts depending on noise,
 * lighting and how fast the hand moves. On the owner's phone the meter reached
 * 70% when the receipt had actually moved one full frame, so the page passes
 * `100 / 70` to make the number track the paper again. Keep it a parameter, not
 * a baked-in constant, so a different device can be recalibrated without
 * touching this arithmetic.
 */
export function travelPercent(offset: number, rows: number, calibration = 1): number {
  const frameRows = Math.floor(rows)
  if (!Number.isFinite(frameRows) || frameRows <= 0) return 0
  if (!Number.isFinite(offset)) return 0
  const scale = Number.isFinite(calibration) && calibration > 0 ? calibration : 1
  const raw = (offset / frameRows) * scale * 100
  return Math.min(100, Math.max(0, Math.round(raw)))
}

/**
 * Row displacement between two profiles, as the integer `shift` where
 * `prev[i] ≈ curr[i + shift]` (positive = content slid down the screen).
 *
 * The page calls this on NEIGHBOUR frames with a narrow window (12% of the
 * rows) and accumulates the answer: a narrow window is what keeps a repetitive
 * receipt unambiguous, because it cannot reach the neighbouring identical line.
 *
 * Normalised cross-correlation over every integer shift in
 * `[-maxShift, maxShift]`. Returns `null` when the overlap is too short to
 * measure or when the best score is below `CONFIDENCE_FLOOR`.
 *
 * There is no runner-up test: two plausible alignments is the NORMAL state of a
 * repetitive receipt, and refusing to answer there is what made the meter
 * disappear. The winning peak may sit one line off; see the module comment.
 *
 * The number is all the meter needs; `estimateVerticalShiftDetailed` is the same
 * search and additionally reports the score, for the temporary diagnostics of
 * the physical test. This function is defined in terms of that one, so the two
 * can never disagree.
 */
export function estimateVerticalShift(
  prev: Float32Array,
  curr: Float32Array,
  maxShift: number,
): number | null {
  const detailed = estimateVerticalShiftDetailed(prev, curr, maxShift)
  return detailed === null ? null : detailed.shift
}

/**
 * Same measurement as `estimateVerticalShift`, but it also reports the winning
 * correlation score. The score is what tells an operator on a real phone whether
 * a rejected sample was rejected for a good reason (a low match) or because the
 * step was too large: without it the diagnostics only show the verdict.
 *
 * `score` is a Pearson coefficient in -1..1. `null` keeps exactly the meaning it
 * has in `estimateVerticalShift`: the overlap was too short, or nothing reached
 * `CONFIDENCE_FLOOR`.
 */
export function estimateVerticalShiftDetailed(
  prev: Float32Array,
  curr: Float32Array,
  maxShift: number,
): { shift: number; score: number } | null {
  const rows = Math.min(prev.length, curr.length)
  if (rows < MIN_OVERLAP_ROWS) return null

  const requested = Math.floor(maxShift)
  if (!Number.isFinite(requested) || requested < 0) return null

  // A shift wider than the profile would leave fewer than MIN_OVERLAP_ROWS of
  // shared rows, so the search window stops one overlap short of the edge.
  const limit = Math.min(requested, rows - MIN_OVERLAP_ROWS)
  if (limit < 0) return null

  let bestShift = 0
  let bestScore = Number.NEGATIVE_INFINITY

  for (let shift = -limit; shift <= limit; shift++) {
    const score = normalisedCorrelation(prev, curr, shift)
    if (score > bestScore) {
      bestScore = score
      bestShift = shift
    }
  }

  if (!Number.isFinite(bestScore) || bestScore < CONFIDENCE_FLOOR) return null

  return { shift: bestShift, score: bestScore }
}

/**
 * NET travel down the receipt since the last capture, in sampler rows: the
 * accumulator the meter shows. This is a signed measurement, not a ratchet.
 * Rules, in order:
 *
 * 1. A non-positive `rows` (or a nonsensical one) can hold no travel and
 *    answers 0.
 * 2. The offset is CLAMPED to `0..rows`: one frame of travel is 100% of the
 *    page the operator is looking at, so nothing above it means anything, and
 *    the top of the receipt cannot be travelled up past.
 * 3. `shift === null` means the frame was not measurable: the offset is
 *    returned UNCHANGED. A bad sample must never reset the reading.
 * 4. A step wider than `maxStep` (the caller's own search window) is not a
 *    measurement either: rejected, offset unchanged.
 * 5. `|shift| <= JITTER_ROWS` (one row) is hand tremor, not travel: ignored,
 *    offset unchanged. It is checked AFTER rule 4 so a real movement is never
 *    mistaken for jitter. One row, not two: a two-row band swallowed the small
 *    steps of a slow walk and the meter undercounted the real travel.
 * 6. Otherwise the offset follows the camera in both directions. `shift < 0`
 *    means the content slid UP the screen because the camera moved DOWN the
 *    receipt: forward travel, ADDED as `-shift`. `shift > 0` means the content
 *    slid DOWN the screen because the camera moved back UP the receipt:
 *    backwards travel, SUBTRACTED as `-shift`.
 *
 * Rule 6 is the correction that matters: only a NET measurement answers the
 * question the meter exists for (do these two photos share enough lines?); a
 * one-way accumulator reported travel that had already been undone. Only a
 * capture resets the offset (the page does that, not this function).
 */
export function accumulateTravel(
  offset: number,
  shift: number | null,
  rows: number,
  maxStep: number,
): number {
  const frameRows = Math.floor(rows)
  if (!Number.isFinite(frameRows) || frameRows <= 0) return 0

  const seed = Number.isFinite(offset) ? offset : 0
  const current = Math.min(frameRows, Math.max(0, seed))

  // Rule 3: nothing was measured, so nothing changes.
  if (shift === null || !Number.isFinite(shift)) return current

  const step = Math.floor(maxStep)
  if (!Number.isFinite(step) || step < 1) return current
  // Rule 4: an impossible step did not come from the search window.
  if (Math.abs(shift) > step) return current
  // Rule 5: a single row is the hand shaking, not the camera travelling.
  if (Math.abs(shift) <= JITTER_ROWS) return current

  // Rule 6: signed net travel. `-shift` is positive for forward motion and
  // negative for backwards motion, and the clamp keeps the result a position on
  // the page the operator is looking at.
  return Math.min(frameRows, Math.max(0, current - shift))
}

/**
 * Whether one sample was applied to the offset, and why not when it was not.
 * Exists for the temporary on-screen diagnostics of the physical test: a
 * rejected sample and an unmeasurable one look identical in the number alone.
 */
export type TravelVerdict =
  | 'applied'
  | 'jitter'
  | 'out_of_window'
  | 'not_measured'
  | 'invalid_rows'

/**
 * The same decision `accumulateTravel` takes, reported instead of applied.
 *
 * Kept next to the accumulator ON PURPOSE and expressed with the same rules in
 * the same order, so the diagnostic can never disagree with the number it is
 * explaining. Nothing in the meter depends on it.
 */
export function classifyTravel(
  shift: number | null,
  rows: number,
  maxStep: number,
): { verdict: TravelVerdict; delta: number } {
  const frameRows = Math.floor(rows)
  if (!Number.isFinite(frameRows) || frameRows <= 0) return { verdict: 'invalid_rows', delta: 0 }
  if (shift === null || !Number.isFinite(shift)) return { verdict: 'not_measured', delta: 0 }

  const step = Math.floor(maxStep)
  if (!Number.isFinite(step) || step < 1) return { verdict: 'not_measured', delta: 0 }
  if (Math.abs(shift) > step) return { verdict: 'out_of_window', delta: 0 }
  if (Math.abs(shift) <= JITTER_ROWS) return { verdict: 'jitter', delta: 0 }

  return { verdict: 'applied', delta: -shift }
}

/**
 * Pearson correlation of the overlapping rows for one shift, in -1..1.
 * `-Infinity` marks a comparison that cannot be scored (no overlap, or a band
 * so flat that there is nothing to correlate), so it can never win the search.
 */
function normalisedCorrelation(prev: Float32Array, curr: Float32Array, shift: number): number {
  const start = Math.max(0, -shift)
  const end = Math.min(prev.length, curr.length - shift)
  const count = end - start
  if (count < MIN_OVERLAP_ROWS) return Number.NEGATIVE_INFINITY

  let sumPrev = 0
  let sumCurr = 0
  for (let i = start; i < end; i++) {
    sumPrev += prev[i]
    sumCurr += curr[i + shift]
  }
  const meanPrev = sumPrev / count
  const meanCurr = sumCurr / count

  let covariance = 0
  let variancePrev = 0
  let varianceCurr = 0
  for (let i = start; i < end; i++) {
    const deltaPrev = prev[i] - meanPrev
    const deltaCurr = curr[i + shift] - meanCurr
    covariance += deltaPrev * deltaCurr
    variancePrev += deltaPrev * deltaPrev
    varianceCurr += deltaCurr * deltaCurr
  }

  const denominator = Math.sqrt(variancePrev * varianceCurr)
  if (!(denominator > VARIANCE_EPSILON)) return Number.NEGATIVE_INFINITY

  return covariance / denominator
}
