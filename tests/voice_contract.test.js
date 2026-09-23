// tests/voice_contract.test.js
// Contract-level checks for the voice multipart body and local limits.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_AUDIO_BYTES,
  MAX_CONTEXT_BYTES,
  buildVoiceJobFormData,
  validateAudioBlob,
  validateContextSize,
} from '../src/voice/contract.ts';

const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';

function makeContext() {
  return {
    local_datetime: '2026-09-23T14:30:00-03:00',
    local_date: '2026-09-23',
    timezone: 'America/Argentina/Buenos_Aires',
    local_currency: 'ARS',
    expense_categories: [{ id: '1', name: 'Alimentos', parent_name: null }],
    income_sources: [{ id: '2', name: 'Sueldo' }],
    wallets: [{ id: '3', name: 'Efectivo', currency: 'ARS' }],
    cards: [{ id: '4', name: 'Visa', supported_currencies: ['ARS', 'USD'] }],
  };
}

function makeOversizedContext() {
  const context = makeContext();
  context.expense_categories = Array.from({ length: 2500 }, (_, index) => ({
    id: String(index),
    name: 'x'.repeat(300),
    parent_name: null,
  }));
  return context;
}

test('validateAudioBlob rejects an empty blob', () => {
  assert.deepEqual(validateAudioBlob(new Blob([])), { ok: false, reason: 'empty' });
});

test('validateAudioBlob rejects a blob above MAX_AUDIO_BYTES', () => {
  const oversized = new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)]);
  assert.deepEqual(validateAudioBlob(oversized), { ok: false, reason: 'too_big' });
});

test('validateAudioBlob accepts a blob exactly at MAX_AUDIO_BYTES', () => {
  const atLimit = new Blob([new Uint8Array(MAX_AUDIO_BYTES)]);
  assert.deepEqual(validateAudioBlob(atLimit), { ok: true });
});

test('validateContextSize accepts a small context', () => {
  assert.equal(validateContextSize(makeContext()), true);
});

test('validateContextSize rejects a context above MAX_CONTEXT_BYTES', () => {
  const oversized = makeOversizedContext();
  assert.ok(
    JSON.stringify(oversized).length > MAX_CONTEXT_BYTES,
    'fixture must exceed MAX_CONTEXT_BYTES'
  );
  assert.equal(validateContextSize(oversized), false);
});

test('buildVoiceJobFormData sends exactly four fields', () => {
  const formData = buildVoiceJobFormData({
    audioBlob: new Blob([new Uint8Array(64)], { type: 'audio/ogg' }),
    idempotencyKey: IDEMPOTENCY_KEY,
    language: 'es-AR',
    context: makeContext(),
  });

  const keys = [];
  for (const [key] of formData.entries()) keys.push(key);

  assert.deepEqual(keys.sort(), ['audio', 'context', 'idempotency_key', 'language']);
  assert.equal(formData.get('idempotency_key'), IDEMPOTENCY_KEY);
  assert.equal(formData.get('language'), 'es-AR');
  assert.ok(formData.get('audio') !== null, 'audio part must be present');
});

test('buildVoiceJobFormData never sends audio_codec', () => {
  const formData = buildVoiceJobFormData({
    audioBlob: new Blob([new Uint8Array(64)], { type: 'audio/webm' }),
    idempotencyKey: IDEMPOTENCY_KEY,
    language: 'es-AR',
    context: makeContext(),
  });

  assert.equal(formData.has('audio_codec'), false);
  for (const [key] of formData.entries()) {
    assert.notEqual(key, 'audio_codec');
  }
});

test('buildVoiceJobFormData serializes the context as parseable JSON', () => {
  const context = makeContext();
  const formData = buildVoiceJobFormData({
    audioBlob: new Blob([new Uint8Array(64)], { type: 'audio/mp4' }),
    idempotencyKey: IDEMPOTENCY_KEY,
    language: 'es-AR',
    context,
  });

  const rawContext = formData.get('context');
  assert.equal(typeof rawContext, 'string');
  assert.deepEqual(JSON.parse(rawContext), context);
});
