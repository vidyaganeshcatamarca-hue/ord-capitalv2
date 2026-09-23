// tests/voice_codec.test.js
// Codec capability fallback checks (Node has no MediaRecorder).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTED_MIME_TYPES,
  isBrowserSupported,
  pickSupportedMime,
} from '../src/voice/codec.ts';

test('MediaRecorder is unavailable outside the browser', () => {
  assert.equal(typeof MediaRecorder, 'undefined');
  assert.equal(isBrowserSupported(), false);
});

test('pickSupportedMime falls back to the first candidate in Node', () => {
  assert.equal(pickSupportedMime(), SUPPORTED_MIME_TYPES[0]);
  assert.equal(SUPPORTED_MIME_TYPES[0], 'audio/ogg;codecs=opus');
});

test('the fallback chain keeps Opus first and MP4 last', () => {
  assert.deepEqual(
    [...SUPPORTED_MIME_TYPES],
    ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4']
  );
});
