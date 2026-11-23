// tests/camera_batch_focus.test.js
// Run: node --test tests/camera_batch_focus.test.js
//
// The software-autofocus sweep must be generic: it may only use the range the
// device declares, it must keep the sharpest stop, and it must say honestly when
// the lens never took the distance.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

async function loadFocus() {
  const { buildSync } = require('esbuild')
  const file = path.resolve(process.cwd(), 'src/ocr/camera/focus.ts')
  const out = buildSync({
    entryPoints: [file],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'node',
  })
  const code = out.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

/**
 * A track that behaves like the phone under test: it declares a range, accepts
 * `manual`, and the frame is sharpest at ONE distance (the real one).
 */
function fakeTrack({ min = 0.1, max = 0.5, modes = ['manual', 'continuous'], accepts = true, sharpAt = 0.4 }) {
  let current = min
  return {
    applyConstraints: async ({ advanced }) => {
      const wanted = advanced?.[0]
      if (!accepts || wanted === undefined || wanted.focusMode !== 'manual') return
      current = wanted.focusDistance
    },
    getCapabilities: () => ({ focusMode: modes, focusDistance: { min, max, step: 0.01 } }),
    // A lens that ignores the constraint keeps sitting where the driver left it,
    // which is NOT any of the candidates the sweep tried.
    getSettings: () => ({ focusDistance: accepts ? current : 0.0001, focusMode: 'manual' }),
    sharpness: () => 100 - Math.abs(current - sharpAt) * 400,
  }
}

const noWait = async () => {}

test('keeps the sharpest stop of the declared range', async () => {
  const { sweepFocus } = await loadFocus()
  const track = fakeTrack({ sharpAt: 0.34 })
  const result = await sweepFocus({ track, measure: track.sharpness, wait: noWait })
  assert.equal(result.supported, true)
  assert.ok(Math.abs(result.distance - 0.34) < 0.1, `picked ${result.distance}`)
  assert.equal(result.applied, true)
})

test('works on a dioptre range, no unit assumptions', async () => {
  const { sweepFocus } = await loadFocus()
  const track = fakeTrack({ min: 0, max: 10, sharpAt: 7 })
  const result = await sweepFocus({ track, measure: track.sharpness, wait: noWait })
  assert.equal(result.supported, true)
  assert.ok(result.distance > 3, `picked ${result.distance}`)
})

test('a device without a distance range is left alone', async () => {
  const { sweepFocus } = await loadFocus()
  const result = await sweepFocus({
    track: {
      applyConstraints: async () => {},
      getCapabilities: () => ({ focusMode: ['continuous'] }),
      getSettings: () => ({}),
    },
    measure: () => 0,
    wait: noWait,
  })
  assert.deepEqual(result, { supported: false, reason: 'no-manual-mode' })
})

test('a device with manual but no range is left alone', async () => {
  const { sweepFocus } = await loadFocus()
  const result = await sweepFocus({
    track: {
      applyConstraints: async () => {},
      getCapabilities: () => ({ focusMode: ['manual', 'continuous'] }),
      getSettings: () => ({}),
    },
    measure: () => 0,
    wait: noWait,
  })
  assert.deepEqual(result, { supported: false, reason: 'no-distance-range' })
})

test('a lens that ignores the distance reports applied:false', async () => {
  const { sweepFocus } = await loadFocus()
  const track = fakeTrack({ accepts: false })
  const result = await sweepFocus({ track, measure: track.sharpness, wait: noWait })
  assert.equal(result.supported, true)
  assert.equal(result.applied, false)
})

test('the sweep never leaves the declared interval', async () => {
  const { sweepFocus } = await loadFocus()
  const track = fakeTrack({ min: 0.15, max: 0.45, sharpAt: 0.45 })
  const result = await sweepFocus({ track, measure: track.sharpness, wait: noWait, steps: 7 })
  assert.ok(result.distance >= 0.15 && result.distance <= 0.45, `out of range: ${result.distance}`)
  assert.equal(result.tried, 7)
})

test('a lens already sharper than every stop is left untouched', async () => {
  const { sweepFocus } = await loadFocus()
  // The sweep will try 0.1..0.5 and the sharpest stop there is 0.34; the current
  // position is better than that, so nothing may move.
  const track = fakeTrack({ sharpAt: 0.34 })
  const positioned = {
    ...track,
    getSettings: () => ({ focusDistance: 0.2, focusMode: 'manual' }),
  }
  const result = await sweepFocus({
    track: positioned,
    // The frame where the lens already sits beats every candidate the sweep tries.
    measure: () => 1000,
    wait: noWait,
    baseline: 1000,
  })
  assert.equal(result.supported, true)
  assert.equal(result.applied, false)
  assert.equal(result.kept, true)
})

test('a clearly sharper candidate still moves the lens', async () => {
  const { sweepFocus } = await loadFocus()
  const track = fakeTrack({ sharpAt: 0.34 })
  const result = await sweepFocus({
    track,
    measure: track.sharpness,
    wait: noWait,
    baseline: 1,
    improvementRatio: 1.2,
  })
  assert.equal(result.kept, false)
  assert.equal(result.applied, true)
})
