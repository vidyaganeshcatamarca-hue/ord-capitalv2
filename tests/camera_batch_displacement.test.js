// tests/camera_batch_displacement.test.js
// ============================================
// Camera batch spike: vertical displacement meter (pure functions only)
// ============================================
// The owner's complaint: a 20% overlap band of a supermarket receipt holds a
// dozen near-identical lines, so the eye has nothing to match. The fix was a
// MEASUREMENT: how far did the camera actually travel down the receipt since
// the reference frame (the last capture)? The visual aids were rejected on a
// real phone and removed, so the measurement is all that is left.
//
// `src/pages/Dev/CameraBatch/displacement.ts` owns the only new logic, and it
// is pure: a Uint8ClampedArray of RGBA bytes in, a number out. No DOM, no
// canvas, no dependency, so it can be tested here with plain node.
//
// SIGN CONVENTION locked by these tests (also documented in the source):
// `estimateVerticalShift(prev, curr, maxShift)` returns `shift` such that
//      prev[i] === curr[i + shift]
// so a POSITIVE shift means the image content slid DOWN the screen, which
// happens when the user moves the camera UP the receipt (backwards), and a
// NEGATIVE shift means the content slid UP the screen: the user moved the
// camera DOWN the receipt, i.e. the direction that makes progress.
//
// ACCUMULATION IS NET, NOT ONE-WAY. `accumulateTravel` adds forward travel and
// SUBTRACTS backwards travel (small tremor excepted), because what the meter
// has to report is the real distance between the capture frame and the current
// one. A one-way accumulator claimed 70% after the operator had already undone
// a quarter of it, which is a false "ready".
//
//   node --test tests/camera_batch_displacement.test.js
//
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  verticalProfile,
  estimateVerticalShift,
  estimateVerticalShiftDetailed,
  accumulateTravel,
  travelPercent,
} from '../src/pages/Dev/CameraBatch/displacement.ts'

/**
 * The sampler the page actually runs: 120x480 for a 1920 px tall stream, so one
 * profile row is 4 real pixels and a ~30 px receipt line spans ~7-8 rows. The
 * per-sample search window is 12% of a frame.
 */
const FRAME_ROWS = 480
const MAX_STEP = Math.max(4, Math.round(FRAME_ROWS * 0.12))
/**
 * The jitter band the page applies: ONE row. A single-row step is a measurable
 * movement, so only a zero-row step is ignored. It used to be two rows, which
 * discarded real travel on a slow walk (see the undercount test below).
 */
const JITTER_ROWS = 1

/** The percentage the page paints, from an exact offset in sampler rows. */
function percentOf(offset) {
  return Math.min(100, Math.max(0, Math.round((offset / FRAME_ROWS) * 100)))
}

/**
 * Deterministic row-luminance profile: one slow band plus per-row noise, which
 * is roughly what a column of receipt text looks like once averaged. The noise
 * is what makes the correlation peak sharp; the slow band keeps it from
 * looking like pure static.
 */
function makeProfile(length, seed = 12345) {
  let state = seed >>> 0
  const random = () => {
    // xorshift32: same bytes on every run and every machine.
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0xffffffff
  }
  const profile = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const band = 0.25 * Math.sin(i * 0.13)
    const noise = 0.2 * (random() * 2 - 1)
    profile[i] = Math.min(1, Math.max(0, 0.5 + band + noise))
  }
  return profile
}

/**
 * A surface with NO relation to the receipt: independent per-row values and no
 * slow band at all.
 *
 * `makeProfile` keeps its envelope independent of the seed ON PURPOSE (two
 * slices of one source must stay comparable), which means two differently
 * seeded calls share that envelope. A smooth periodic envelope correlates with
 * itself at many shifts, so that pair was never "unrelated content": it only
 * came back `null` because the old runner-up test refused every periodic
 * answer, which is exactly the behaviour that used to hide the meter.
 */
function makeUnrelatedProfile(length, seed = 987654) {
  let state = seed >>> 0
  const random = () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0xffffffff
  }
  const profile = new Float32Array(length)
  for (let i = 0; i < length; i++) profile[i] = 0.5 + 0.2 * (random() * 2 - 1)
  return profile
}

/** A window of `length` rows taken at `start`, so shifts need no filler rows. */
function slice(source, start, length) {
  return source.slice(start, start + length)
}

/** Asserts a shift, tolerating the ±1 row of quantisation the meter allows. */
function assertShift(actual, expected) {
  assert.notEqual(actual, null, `expected a shift near ${expected}, got null`)
  assert.ok(
    Math.abs(actual - expected) <= 1,
    `expected a shift near ${expected}, got ${actual}`,
  )
}

test('verticalProfile: one average luminance per row, normalised to 0..1', () => {
  // 3 rows x 2 columns of RGBA: white, mid grey, black.
  const rows = [
    [255, 255, 255],
    [128, 128, 128],
    [0, 0, 0],
  ]
  const data = new Uint8ClampedArray(3 * 2 * 4)
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < 2; x++) {
      const offset = (y * 2 + x) * 4
      data[offset] = rows[y][0]
      data[offset + 1] = rows[y][1]
      data[offset + 2] = rows[y][2]
      data[offset + 3] = 255
    }
  }

  const profile = verticalProfile(data, 2, 3)

  assert.equal(profile.length, 3)
  assert.ok(Math.abs(profile[0] - 1) < 0.01, `white row should be ~1, got ${profile[0]}`)
  assert.ok(
    Math.abs(profile[1] - 128 / 255) < 0.01,
    `grey row should be ~0.50, got ${profile[1]}`,
  )
  assert.ok(Math.abs(profile[2] - 0) < 0.01, `black row should be ~0, got ${profile[2]}`)
})

test('verticalProfile: luminance is weighted, not a plain channel average', () => {
  // Pure red row: 0.299, not 1/3 and not 1.
  const data = new Uint8ClampedArray([255, 0, 0, 255])
  const profile = verticalProfile(data, 1, 1)
  assert.ok(Math.abs(profile[0] - 0.299) < 0.01, `red row should be ~0.299, got ${profile[0]}`)
})

test('estimateVerticalShift: a profile compared with itself has not moved', () => {
  const profile = makeProfile(240)
  assert.equal(estimateVerticalShift(profile, profile, 24), 0)
})

test('estimateVerticalShift: content that slid down by k reads as +k', () => {
  const k = 17
  const source = makeProfile(240 + 200)
  const prev = slice(source, 100, 240)
  // curr[i] = prev[i - k]: what was on row i-k is now on row i.
  const curr = slice(source, 100 - k, 240)

  assertShift(estimateVerticalShift(prev, curr, 24), k)
})

test('estimateVerticalShift: content that slid up by k reads as -k', () => {
  const k = 9
  const source = makeProfile(240 + 200)
  const prev = slice(source, 100, 240)
  const curr = slice(source, 100 + k, 240)

  assertShift(estimateVerticalShift(prev, curr, 24), -k)
})

test('estimateVerticalShift: a shift near the widened window edge is still reported', () => {
  const rows = 240
  // The page searches 80% of the reference rows per side, which is what makes
  // 100% of travel reachable at all.
  const maxShift = Math.round(rows * 0.8)
  const source = makeProfile(rows + 400)
  const prev = slice(source, 200, rows)
  // 180 rows of real travel: three quarters of a frame, the point where the
  // meter asks for a capture, and well inside the widened window.
  const curr = slice(source, 200 + 180, rows)

  assertShift(estimateVerticalShift(prev, curr, maxShift), -180)
})

test('estimateVerticalShift: unrelated content returns null, not a guess', () => {
  const prev = makeProfile(240, 1111)
  const curr = makeUnrelatedProfile(240, 987654)

  assert.equal(estimateVerticalShift(prev, curr, 24), null)
})

test('estimateVerticalShift: a flat, featureless band returns null', () => {
  // Blank paper: every row identical, correlation is undefined.
  const flat = new Float32Array(240).fill(0.62)
  const alsoFlat = new Float32Array(240).fill(0.61)

  assert.equal(estimateVerticalShift(flat, alsoFlat, 24), null)
})

test('estimateVerticalShift: a shift never falls outside the requested window', () => {
  const source = makeProfile(240 + 200)
  const prev = slice(source, 100, 240)
  const curr = slice(source, 90, 240)
  const maxShift = 4

  const shift = estimateVerticalShift(prev, curr, maxShift)
  if (shift !== null) {
    assert.ok(Math.abs(shift) <= maxShift, `shift ${shift} escaped the +-${maxShift} window`)
  }
})

// ─── estimateVerticalShiftDetailed ──────────────────────────────────────────
// The physical test needs the correlation SCORE next to the shift: it is the
// only way to tell "the operator moved a lot" from "the frame did not match".

test('estimateVerticalShiftDetailed: reports the same shift plus a score in -1..1', () => {
  const k = 12
  const source = makeProfile(240 + 200)
  const prev = slice(source, 100, 240)
  const curr = slice(source, 100 - k, 240)

  const detailed = estimateVerticalShiftDetailed(prev, curr, 24)
  assert.notEqual(detailed, null, 'expected a detailed estimate, got null')
  assertShift(detailed.shift, k)
  assert.ok(
    detailed.score >= -1 && detailed.score <= 1,
    `score ${detailed.score} escaped the -1..1 range`,
  )
  // A slice of one source at 12 rows of travel is a strong match, not a guess.
  assert.ok(detailed.score > 0.9, `expected a strong match, got score ${detailed.score}`)

  // The plain function and the detailed one must never disagree.
  assert.equal(estimateVerticalShift(prev, curr, 24), detailed.shift)
})

test('estimateVerticalShiftDetailed: a perfect match scores ~1 and shifts 0', () => {
  const profile = makeProfile(240)
  const detailed = estimateVerticalShiftDetailed(profile, profile, 24)

  assert.notEqual(detailed, null, 'expected a detailed estimate, got null')
  assert.equal(detailed.shift, 0)
  assert.ok(
    Math.abs(detailed.score - 1) < 0.001,
    `self correlation should be ~1, got ${detailed.score}`,
  )
})

test('estimateVerticalShiftDetailed: null where the plain function is null', () => {
  const flat = new Float32Array(240).fill(0.62)
  const alsoFlat = new Float32Array(240).fill(0.61)
  assert.equal(estimateVerticalShiftDetailed(flat, alsoFlat, 24), null)
  assert.equal(estimateVerticalShift(flat, alsoFlat, 24), null)

  const prev = makeProfile(240, 1111)
  const curr = makeUnrelatedProfile(240, 987654)
  assert.equal(estimateVerticalShiftDetailed(prev, curr, 24), null)
  assert.equal(estimateVerticalShift(prev, curr, 24), null)
})

// ─── accumulateTravel ───────────────────────────────────────────────────────
// The meter no longer measures against a fixed reference frame: it measures
// FRAME TO FRAME and accumulates. These are the rules of that accumulation.
// The offset is NET travel: forward adds, backwards subtracts.

test('accumulateTravel: a forward shift (content slid up) increases the offset', () => {
  // shift < 0 means the content moved UP the screen: the camera moved DOWN the
  // receipt, which is forward travel.
  assert.equal(accumulateTravel(0, -18, FRAME_ROWS, MAX_STEP), 18)
  assert.equal(accumulateTravel(100, -18, FRAME_ROWS, MAX_STEP), 118)
})

test('accumulateTravel: no estimate leaves the offset untouched', () => {
  assert.equal(accumulateTravel(137, null, FRAME_ROWS, MAX_STEP), 137)
})

test('accumulateTravel: a backward shift (content slid down) SUBTRACTS', () => {
  // shift > 0 means the content moved DOWN the screen: the camera moved back UP
  // the receipt. Net travel, so it takes travel away.
  assert.equal(accumulateTravel(200, 3, FRAME_ROWS, MAX_STEP), 197)
  assert.equal(accumulateTravel(200, 20, FRAME_ROWS, MAX_STEP), 180)
  assert.equal(accumulateTravel(200, MAX_STEP, FRAME_ROWS, MAX_STEP), 200 - MAX_STEP)
})

test('accumulateTravel: ONE row of hand jitter changes nothing, two rows are travel', () => {
  // |shift| <= 1 is the paper shaking in the operator's hands, not travel. It is
  // ignored in BOTH directions, or the offset would crawl with noise.
  for (const jitter of [0, 1, -1]) {
    assert.equal(
      accumulateTravel(200, jitter, FRAME_ROWS, MAX_STEP),
      200,
      `jitter ${jitter} should not move the offset`,
    )
  }
  // |shift| == 2 is a real movement now: the band is one row, not two. Both
  // signs still count, so a small step forward and a small step back are both
  // applied instead of being swallowed as tremor.
  assert.equal(accumulateTravel(200, -2, FRAME_ROWS, MAX_STEP), 202)
  assert.equal(accumulateTravel(200, 2, FRAME_ROWS, MAX_STEP), 198)
})

test('accumulateTravel: a step wider than the search window is rejected', () => {
  // Wider than the caller's own search window: not a measurement, so the offset
  // stays exactly where it was, in both directions.
  assert.equal(accumulateTravel(50, -(MAX_STEP + 1), FRAME_ROWS, MAX_STEP), 50)
  assert.equal(accumulateTravel(50, MAX_STEP + 1, FRAME_ROWS, MAX_STEP), 50)
  assert.equal(accumulateTravel(50, -(FRAME_ROWS * 3), FRAME_ROWS, MAX_STEP), 50)
  assert.equal(accumulateTravel(50, FRAME_ROWS * 3, FRAME_ROWS, MAX_STEP), 50)
  // Just inside the window is still a measurement.
  assert.equal(accumulateTravel(50, -(MAX_STEP - 1), FRAME_ROWS, MAX_STEP), 50 + MAX_STEP - 1)
})

test('accumulateTravel: the offset is clamped to 0..one frame of rows', () => {
  // Bottom clamp: coming back up cannot take the offset below the top of the
  // page the operator is on.
  assert.equal(accumulateTravel(10, 18, FRAME_ROWS, MAX_STEP), 0)
  assert.equal(accumulateTravel(0, MAX_STEP, FRAME_ROWS, MAX_STEP), 0)
  // Top clamp: one frame of travel is one page.
  assert.equal(accumulateTravel(FRAME_ROWS - 5, -MAX_STEP, FRAME_ROWS, MAX_STEP), FRAME_ROWS)
  assert.equal(accumulateTravel(FRAME_ROWS, -MAX_STEP, FRAME_ROWS, MAX_STEP), FRAME_ROWS)
  // Defensive: a nonsensical frame height or a negative seed cannot leak out.
  assert.equal(accumulateTravel(-40, -18, FRAME_ROWS, MAX_STEP), 18)
  assert.equal(accumulateTravel(120, -18, 0, MAX_STEP), 0)
})

test('accumulateTravel: ten consecutive small forward shifts add up to the travel', () => {
  // THE regression the owner reported: while scrolling down a receipt the meter
  // fell back to 0 and jumped to 30. Ten steady samples of 18 rows (a bit over
  // two printed lines each) must be worth 180 rows, not one arbitrary peak.
  const perSample = 18
  let offset = 0
  for (let i = 0; i < 10; i++) {
    offset = accumulateTravel(offset, -perSample, FRAME_ROWS, MAX_STEP)
  }

  assert.equal(offset, perSample * 10)
  assert.equal(percentOf(offset), 38)
})

test('accumulateTravel: down ~70%, back up ~25%, and the offset DECREASES', () => {
  // The case the senior reviewer asked for. The one-way accumulator kept the
  // 70% after the operator had come back up a quarter of a frame, so it told
  // them to capture with an overlap that was no longer there: a FALSE ready.
  const down = 56 // 6 x 56 = 336 rows = 70% of 480
  const backUp = 40 // 3 x 40 = 120 rows = 25% of 480

  let offset = 0
  for (let i = 0; i < 6; i++) offset = accumulateTravel(offset, -down, FRAME_ROWS, MAX_STEP)

  const peak = offset
  assert.equal(peak, 336)
  assert.equal(percentOf(peak), 70)

  // Coming back up the receipt: content slides down the screen, shift > 0.
  for (let i = 0; i < 3; i++) offset = accumulateTravel(offset, backUp, FRAME_ROWS, MAX_STEP)

  assert.ok(offset < peak, `the offset must decrease: ${offset} vs ${peak}`)
  assert.equal(offset, 216)
  assert.equal(percentOf(offset), 45)

  // Going down again genuinely re-earns the target.
  for (let i = 0; i < 3; i++) offset = accumulateTravel(offset, -backUp, FRAME_ROWS, MAX_STEP)

  assert.equal(offset, peak)
  assert.ok(percentOf(offset) >= 70, `expected to reach the target, got ${percentOf(offset)}%`)
})

test('accumulateTravel: a rejected or unmeasurable sample leaves a mid-travel offset alone', () => {
  // Rejection must never be confused with backward travel: a too-wide step is
  // not a measurement, so it cannot subtract either.
  const at = 216
  assert.equal(accumulateTravel(at, null, FRAME_ROWS, MAX_STEP), at)
  assert.equal(accumulateTravel(at, MAX_STEP + 20, FRAME_ROWS, MAX_STEP), at)
  assert.equal(accumulateTravel(at, -(MAX_STEP + 20), FRAME_ROWS, MAX_STEP), at)
  assert.equal(accumulateTravel(at, JITTER_ROWS, FRAME_ROWS, MAX_STEP), at)
  assert.equal(accumulateTravel(at, -JITTER_ROWS, FRAME_ROWS, MAX_STEP), at)
})

test('accumulateTravel: a slow walk of two rows per sample is not swallowed', () => {
  // THE second undercount the owner reported on a real receipt: at 50% shown he
  // already had the overlap he needed, because most of his travel arrived in
  // SMALL steps. With the old two-row band every two-row step was classified as
  // hand tremor and discarded, so a slow walk of two rows per sample contributed
  // nothing and the meter ran at half speed or worse while the paper was really
  // moving. The band is one row now, so a two-row step is travel and twelve of
  // them are worth exactly twenty-four rows.
  //
  // Only the CURRENT contract is asserted here; the old behaviour is documented
  // above, not re-implemented.
  const perSample = 2
  const samples = 12
  let offset = 0
  for (let i = 0; i < samples; i++) {
    offset = accumulateTravel(offset, -perSample, FRAME_ROWS, MAX_STEP)
  }

  assert.equal(offset, samples * perSample)

  // The same slow travel in reverse is measured too, not just forward motion.
  let back = offset
  for (let i = 0; i < samples; i++) back = accumulateTravel(back, perSample, FRAME_ROWS, MAX_STEP)
  assert.equal(back, 0)
})

test('accumulateTravel: net travel through a shaky walk matches the real displacement', () => {
  // A realistic sequence: steady forward travel with tremor mixed in, then one
  // step that was too wide to measure. The total must equal the sum of the
  // measurable forward steps, because the tremor and the rejected step are not
  // travel at all.
  const samples = [-30, -1, -25, 1, -28, -(MAX_STEP + 5), -12, 1, -20]
  let offset = 0
  for (const shift of samples) offset = accumulateTravel(offset, shift, FRAME_ROWS, MAX_STEP)

  assert.equal(offset, 30 + 25 + 28 + 12 + 20)
  assert.equal(percentOf(offset), 24)
})

test('travelPercent: no travel is zero and a full frame is a full bar', () => {
  assert.equal(travelPercent(0, FRAME_ROWS), 0)
  assert.equal(travelPercent(FRAME_ROWS, FRAME_ROWS), 100)
  assert.equal(travelPercent(FRAME_ROWS * 2, FRAME_ROWS), 100)
  assert.equal(travelPercent(-50, FRAME_ROWS), 0)
})

test('travelPercent: the device calibration makes 70% of the bar mean a full frame', () => {
  // Regression from the physical test: the meter showed 70% when the receipt had
  // actually travelled one whole frame. With the calibration the same measured
  // offset now reads 100, and the target is reached earlier in physical travel.
  const calibration = 100 / 70
  assert.equal(travelPercent(FRAME_ROWS * 0.7, FRAME_ROWS, calibration), 100)
  assert.equal(travelPercent(FRAME_ROWS * 0.49, FRAME_ROWS, calibration), 70)
  assert.equal(travelPercent(0, FRAME_ROWS, calibration), 0)
})

test('travelPercent: an unusable calibration falls back to one and never divides by zero', () => {
  assert.equal(travelPercent(FRAME_ROWS / 2, FRAME_ROWS, 0), 50)
  assert.equal(travelPercent(FRAME_ROWS / 2, FRAME_ROWS, -3), 50)
  assert.equal(travelPercent(FRAME_ROWS / 2, FRAME_ROWS, Number.NaN), 50)
  assert.equal(travelPercent(100, 0), 0)
})
