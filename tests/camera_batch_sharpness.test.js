// tests/camera_batch_sharpness.test.js
// Run: node --test tests/camera_batch_sharpness.test.js
//
// The software-autofocus loop ranks frames by sharpness. If the score cannot
// tell a sharp receipt from a blurred one, the whole sweep picks noise.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// The module is TypeScript; strip the types at load time with esbuild, which the
// project already depends on through Vite.
async function loadSharpness() {
  const { buildSync } = require('esbuild')
  const path = require('node:path')
  const file = path.resolve(process.cwd(), 'src/ocr/camera/sharpness.ts')
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

/** Uniform grey buffer: no gradients at all. */
function flat(width, height, value = 128) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  return data
}

/** Vertical black/white bars: maximum horizontal gradient, i.e. "in focus". */
function striped(width, height) {
  const data = flat(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const value = x % 2 === 0 ? 0 : 255
      data[i] = value
      data[i + 1] = value
      data[i + 2] = value
    }
  }
  return data
}

test('a flat frame scores zero', async () => {
  const { frameSharpness } = await loadSharpness()
  assert.equal(frameSharpness(flat(40, 40), 40, 40), 0)
})

test('a striped frame scores far above a flat one', async () => {
  const { frameSharpness } = await loadSharpness()
  const soft = frameSharpness(flat(40, 40), 40, 40)
  const sharp = frameSharpness(striped(40, 40), 40, 40)
  assert.ok(sharp > 50, `sharp score too low: ${sharp}`)
  assert.ok(sharp > soft * 10, 'sharp must dominate soft')
})

test('the score does not grow with the canvas size', async () => {
  const { frameSharpness } = await loadSharpness()
  const small = frameSharpness(striped(40, 40), 40, 40)
  const large = frameSharpness(striped(120, 120), 120, 120)
  const delta = Math.abs(small - large) / Math.max(small, large)
  assert.ok(delta < 0.1, `normalisation drift: ${small} vs ${large}`)
})

test('a truncated buffer scores zero instead of throwing', async () => {
  const { frameSharpness } = await loadSharpness()
  assert.equal(frameSharpness(new Uint8ClampedArray(16), 40, 40), 0)
})

test('sweep candidates stay inside a metric range', async () => {
  const { focusSweepCandidates } = await loadSharpness()
  const values = focusSweepCandidates(0.1, 0.5, 6)
  assert.equal(values.length, 6)
  assert.equal(values[0], 0.1)
  assert.equal(values[values.length - 1], 0.5)
  for (const value of values) assert.ok(value >= 0.1 && value <= 0.5)
})

test('sweep candidates stay inside a dioptre range, units untouched', async () => {
  const { focusSweepCandidates } = await loadSharpness()
  const values = focusSweepCandidates(0, 10, 5)
  assert.equal(values.length, 5)
  assert.equal(values[0], 0)
  assert.equal(values[values.length - 1], 10)
})

test('an unusable range yields no candidates', async () => {
  const { focusSweepCandidates } = await loadSharpness()
  assert.deepEqual(focusSweepCandidates(0.5, 0.5), [])
  assert.deepEqual(focusSweepCandidates(0.5, 0.1), [])
  assert.deepEqual(focusSweepCandidates(Number.NaN, 1), [])
})
