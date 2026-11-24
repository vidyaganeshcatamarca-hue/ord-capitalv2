// tests/ocr_camera_shutter.test.js
// Run: node --test tests/ocr_camera_shutter.test.js
//
// Shutter feedback is the WEB fallback; the APK replaces it. What must never
// happen is a capture breaking because the audio stack is missing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

async function loadShutter() {
  const { buildSync } = require('esbuild')
  const file = path.resolve(process.cwd(), 'src/ocr/camera/shutterSound.ts')
  const out = buildSync({ entryPoints: [file], bundle: true, format: 'esm', write: false, platform: 'node' })
  const code = out.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

test('without a browser audio stack it stays silent instead of throwing', async () => {
  const { playShutterSound, createShutterFeedback } = await loadShutter()
  assert.doesNotThrow(() => playShutterSound())
  assert.doesNotThrow(() => createShutterFeedback().fire())
})

function withNavigator(value, run) {
  // `globalThis.navigator` is a getter in Node, so a plain assignment throws.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
  try {
    run()
  } finally {
    if (descriptor === undefined) delete globalThis.navigator
    else Object.defineProperty(globalThis, 'navigator', descriptor)
  }
}

test('fire() is safe even when the phone cannot vibrate', async () => {
  const { createShutterFeedback } = await loadShutter()
  withNavigator({ vibrate: undefined }, () => {
    assert.doesNotThrow(() => createShutterFeedback().fire())
  })
})

test('a vibrating phone is asked to vibrate once per shot', async () => {
  const { createShutterFeedback } = await loadShutter()
  let calls = 0
  withNavigator({ vibrate: () => { calls += 1; return true } }, () => {
    createShutterFeedback().fire()
  })
  assert.equal(calls, 1)
})
