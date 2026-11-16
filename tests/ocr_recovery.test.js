// tests/ocr_recovery.test.js
// ============================================
// OCR: envíos que el servidor ya no tiene
// ============================================
// `recordOcrHistory` sólo corre después de que `createOcrJob` responde aceptado,
// así que NO existe en el historial un envío que "nunca llegó". El caso real es
// otro: el POST fue aceptado y después el backend dejó de conocerlo (404). Eso
// es lo que la UI rotula "El servidor ya no lo tiene" y lo que habilita
// reenviar o borrar.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearOcrHistory,
  loadOcrHistory,
  recordOcrHistory,
  removeOcrHistoryEntry,
} from '../src/ocr/history.ts';
import { isLostOcrHistoryEntry } from '../src/ocr/recovery.ts';

function installMemoryLocalStorage() {
  const data = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      get length() {
        return data.size;
      },
      key: (index) => [...data.keys()][index] ?? null,
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: (key) => data.delete(key),
      clear: () => data.clear(),
    },
    configurable: true,
    writable: true,
  });
  return data;
}

function entry(jobId, status = 'processing') {
  return {
    job_id: jobId,
    created_at: '2026-11-14T21:08:00.000Z',
    image_count: 3,
    status,
    updated_at: '2026-11-14T21:08:00.000Z',
    pendiente_id: null,
  };
}

function job(jobId, errorCode = null) {
  return {
    job_id: jobId,
    owner_user_id: 'user-1',
    created_at: '2026-11-14T21:08:00.000Z',
    last_status: null,
    last_stage: null,
    last_checked_at: null,
    quarantine_dispatched: false,
    pendiente_id: null,
    last_error_code: errorCode,
    last_error_at: null,
    last_successful_poll_at: null,
    server_created_at: null,
    quarantine_dispatched_at: null,
  };
}

beforeEach(() => {
  installMemoryLocalStorage();
});

// ---------------------------------------------------------------- isLost

test('un 404 del backend marca el envío como perdido', () => {
  assert.equal(
    isLostOcrHistoryEntry(entry('j1'), [job('j1', 'NOT_FOUND')]),
    true,
    'the server accepted it once and no longer knows it'
  );
});

test('un fallo de red NO es un envío perdido: el ticket existe', () => {
  assert.equal(isLostOcrHistoryEntry(entry('j2'), [job('j2', 'NETWORK')]), false);
  assert.equal(isLostOcrHistoryEntry(entry('j2'), [job('j2', null)]), false);
});

test('una fila sin job que la siga está perdida', () => {
  assert.equal(isLostOcrHistoryEntry(entry('j3'), []), true);
});

test('un envío que ya tiene desenlace nunca se marca como perdido', () => {
  for (const status of ['quarantine', 'approved', 'rejected', 'classified']) {
    assert.equal(
      isLostOcrHistoryEntry(entry('j4', status), [job('j4', 'NOT_FOUND')]),
      false,
      `${status} is an outcome, not a loss`
    );
  }
});

// ---------------------------------------------------------------- remove

test('borrar una entrada no toca las demás', () => {
  recordOcrHistory(entry('keep-1'));
  recordOcrHistory(entry('drop'));
  recordOcrHistory(entry('keep-2'));

  removeOcrHistoryEntry('drop');

  const ids = loadOcrHistory().value.map((item) => item.job_id).sort();
  assert.deepEqual(ids, ['keep-1', 'keep-2']);
});

test('borrar un envío desconocido no inventa ni rompe', () => {
  recordOcrHistory(entry('only'));
  removeOcrHistoryEntry('fantasma');
  assert.deepEqual(
    loadOcrHistory().value.map((item) => item.job_id),
    ['only']
  );
});

test('borrar la única entrada deja el historial vacío', () => {
  recordOcrHistory(entry('solo'));
  removeOcrHistoryEntry('solo');
  assert.deepEqual(loadOcrHistory().value, []);
  clearOcrHistory();
});
