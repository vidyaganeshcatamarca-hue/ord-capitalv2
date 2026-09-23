// tests/voice_errors.test.js
// Error-code mapping and FastAPI envelope parsing checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  VOICE_ERROR_CODE_TO_I18N_KEY,
  mapVoiceErrorToI18nKey,
  parseFastApiError,
} from '../src/voice/errors.ts';

test('maps known backend codes to their i18n keys', () => {
  assert.equal(mapVoiceErrorToI18nKey('AUDIO_LIMIT_EXCEEDED'), 'voice_audio_too_long');
  assert.equal(mapVoiceErrorToI18nKey('UNSUPPORTED_AUDIO'), 'voice_unsupported_audio');
  assert.equal(mapVoiceErrorToI18nKey('TOO_MANY_ACTIVE_JOBS'), 'voice_too_many_jobs');
  assert.equal(mapVoiceErrorToI18nKey('CONTEXT_TOO_LARGE'), 'voice_context_too_large');
  assert.equal(mapVoiceErrorToI18nKey('RATE_LIMITED'), 'voice_rate_limited');
  assert.equal(mapVoiceErrorToI18nKey('SERVICE_UNAVAILABLE'), 'voice_service_unavailable');
  assert.equal(mapVoiceErrorToI18nKey('UNAUTHORIZED'), 'voice_unauthorized');
  assert.equal(mapVoiceErrorToI18nKey('FORBIDDEN'), 'voice_unauthorized');
  assert.equal(mapVoiceErrorToI18nKey('NOT_FOUND'), 'voice_generic_error');
});

test('unknown codes fall back to the generic key', () => {
  assert.equal(mapVoiceErrorToI18nKey('SOMETHING_NEW'), 'voice_generic_error');
  assert.equal(mapVoiceErrorToI18nKey(''), 'voice_generic_error');
  assert.equal(mapVoiceErrorToI18nKey('AUDIO_LIMIT_EXCEEDED '), 'voice_generic_error');
});

test('every mapped key is a voice i18n key', () => {
  for (const [code, key] of Object.entries(VOICE_ERROR_CODE_TO_I18N_KEY)) {
    assert.equal(typeof key, 'string', `code ${code} must map to a string`);
    assert.ok(key.startsWith('voice_'), `code ${code} must map to a voice key (got ${key})`);
  }
});

test('parseFastApiError reads a well-formed envelope', () => {
  const parsed = parseFastApiError({
    schema_version: 1,
    status: 'error',
    error: { code: 'RATE_LIMITED', message: 'slow down' },
  });

  assert.deepEqual(parsed, {
    code: 'RATE_LIMITED',
    i18nKey: 'voice_rate_limited',
    message: 'slow down',
  });
});

test('parseFastApiError falls back safely on garbage bodies', () => {
  const garbage = [null, undefined, 'string', 42, {}, { error: null }, { error: { code: 7 } }, []];

  for (const body of garbage) {
    const parsed = parseFastApiError(body);
    assert.equal(parsed.code, 'UNKNOWN', `unexpected code for ${JSON.stringify(body)}`);
    assert.equal(parsed.i18nKey, 'voice_generic_error');
    assert.equal(parsed.message, '');
  }
});
