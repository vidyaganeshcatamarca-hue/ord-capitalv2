// tests/voice_storage.test.js
// Local persistence checks for in-flight voice jobs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  key(index) {
    return [...this.map.keys()][index] ?? null;
  }

  get length() {
    return this.map.size;
  }
}

// The stub must exist before the module is imported.
const stub = new MemoryStorage();
globalThis.localStorage = stub;

const {
  VOICE_STORAGE_KEY,
  RESUME_WINDOW_MS,
  addStoredVoiceJob,
  clearStaleStoredVoiceJobs,
  loadStoredVoiceJobs,
  removeStoredVoiceJob,
} = await import('../src/voice/storage.ts');

function makeJob(jobId, overrides = {}) {
  return {
    job_id: jobId,
    created_at: new Date().toISOString(),
    idempotency_key: `key-${jobId}`,
    ...overrides,
  };
}

test('add then load returns the persisted job', () => {
  stub.clear();
  const job = makeJob('job-1');
  addStoredVoiceJob(job);
  assert.deepEqual(loadStoredVoiceJobs(), [job]);
  assert.equal(stub.getItem(VOICE_STORAGE_KEY) !== null, true);
});

test('add replaces an existing job with the same job_id', () => {
  stub.clear();
  addStoredVoiceJob(makeJob('job-1'));
  addStoredVoiceJob(makeJob('job-1', { idempotency_key: 'key-replaced' }));

  const jobs = loadStoredVoiceJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].idempotency_key, 'key-replaced');
});

test('remove drops the persisted job', () => {
  stub.clear();
  addStoredVoiceJob(makeJob('job-1'));
  removeStoredVoiceJob('job-1');
  assert.deepEqual(loadStoredVoiceJobs(), []);
});

test('remove of an unknown job is a no-op', () => {
  stub.clear();
  addStoredVoiceJob(makeJob('job-1'));
  removeStoredVoiceJob('job-missing');
  assert.equal(loadStoredVoiceJobs().length, 1);
});

test('clearStaleStoredVoiceJobs drops jobs older than the resume window', () => {
  stub.clear();
  const stale = makeJob('stale', {
    created_at: new Date(Date.now() - RESUME_WINDOW_MS - 1000).toISOString(),
  });
  const fresh = makeJob('fresh');

  addStoredVoiceJob(stale);
  addStoredVoiceJob(fresh);

  assert.equal(clearStaleStoredVoiceJobs(), 1);

  const remaining = loadStoredVoiceJobs();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].job_id, 'fresh');
});

test('clearStaleStoredVoiceJobs keeps jobs inside the window', () => {
  stub.clear();
  addStoredVoiceJob(makeJob('fresh', { created_at: new Date().toISOString() }));
  assert.equal(clearStaleStoredVoiceJobs(), 0);
  assert.equal(loadStoredVoiceJobs().length, 1);
});

test('clearStaleStoredVoiceJobs drops jobs with an unparseable created_at', () => {
  stub.clear();
  addStoredVoiceJob(makeJob('broken', { created_at: 'not-a-date' }));
  assert.equal(clearStaleStoredVoiceJobs(), 1);
  assert.deepEqual(loadStoredVoiceJobs(), []);
});

test('loadStoredVoiceJobs returns [] for corrupted or non-array payloads', () => {
  stub.clear();
  assert.deepEqual(loadStoredVoiceJobs(), []);

  stub.setItem(VOICE_STORAGE_KEY, 'not json at all');
  assert.deepEqual(loadStoredVoiceJobs(), []);

  stub.setItem(VOICE_STORAGE_KEY, '{"not":"an array"}');
  assert.deepEqual(loadStoredVoiceJobs(), []);

  stub.setItem(VOICE_STORAGE_KEY, 'null');
  assert.deepEqual(loadStoredVoiceJobs(), []);
});

test('loadStoredVoiceJobs filters malformed rows', () => {
  stub.clear();
  stub.setItem(
    VOICE_STORAGE_KEY,
    JSON.stringify([
      { job_id: 'ok', created_at: '2026-09-23T00:00:00.000Z', idempotency_key: 'key-ok' },
      { job_id: 7, created_at: 'x', idempotency_key: 'k' },
      { job_id: 'missing-fields' },
      null,
      'nope',
    ])
  );

  const jobs = loadStoredVoiceJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].job_id, 'ok');
});

test('falls back to an in-memory store when localStorage is unavailable', () => {
  const original = globalThis.localStorage;
  stub.clear();

  try {
    delete globalThis.localStorage;

    addStoredVoiceJob(makeJob('memory-job'));
    assert.equal(loadStoredVoiceJobs().length, 1);

    removeStoredVoiceJob('memory-job');
    assert.deepEqual(loadStoredVoiceJobs(), []);
  } finally {
    globalThis.localStorage = original;
  }
});
