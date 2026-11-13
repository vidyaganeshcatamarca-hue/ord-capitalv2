// tests/ocr_job_ownership.test.js
// ============================================
// OCR job storage: per-user partition (S1-S9) and same-user concurrency (S10)
// ============================================
// Spark closed the root cause: the same jobs alternated 200 and 404 depending on
// who was signed in, because storage mixed both users' rows. These tests pin the
// partition, the "a 404 must not kill the job" rule, and the two-user round trip.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  OCR_STORAGE_TERMINAL_STATUSES,
  isOcrSessionErrorCode,
  loadOcrJobs,
  patchOcrJob,
  selectResumableOcrJobs,
  upsertOcrJob,
} from '../src/ocr/storage.ts';
import { OCR_TERMINAL_STATUSES } from '../src/ocr/types.ts';
import { createOcrDispatcher } from '../src/ocr/dispatch.ts';

/** Minimal localStorage stand-in: these tests never depend on the runtime. */
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

function storedJob(jobId, owner, overrides = {}) {
  return {
    job_id: jobId,
    owner_user_id: owner,
    created_at: '2026-11-06T00:00:00.000Z',
    last_status: 'processing',
    last_checked_at: null,
    quarantine_dispatched: false,
    pendiente_id: null,
    last_error_code: null,
    server_created_at: null,
    quarantine_dispatched_at: null,
    ...overrides,
  };
}

function finishedJob(stored, status = 'needs_review') {
  return {
    job_id: stored.job_id,
    status,
    created_at: stored.created_at,
    ticket: { items: [{ n: 1 }], issues: [] },
    raw_result: { ok: true },
  };
}

/** Dispatcher that records what actually reached the quarantine. */
function makeDispatcher(created) {
  return createOcrDispatcher({
    createQuarantine: async ({ jobId }) => {
      created.push(jobId);
      return { pendiente_id: created.length };
    },
    onTerminalPersisted: () => {},
    onDispatched: (job, pendienteId) => {
      patchOcrJob(job.job_id, {
        last_status: job.status,
        quarantine_dispatched: true,
        pendiente_id: pendienteId,
      });
    },
    onFailed: () => {},
  });
}

beforeEach(() => {
  installMemoryLocalStorage();
});

test('S2: the storage is partitioned by owner_user_id', () => {
  upsertOcrJob(storedJob('A', 'user-a'));
  upsertOcrJob(storedJob('B', 'user-b'));

  const all = loadOcrJobs().value;
  assert.equal(all.length, 2, 'both rows live in the same collection');

  assert.deepEqual(
    selectResumableOcrJobs(all, 'user-a').map((job) => job.job_id),
    ['A']
  );
  assert.deepEqual(
    selectResumableOcrJobs(all, 'user-b').map((job) => job.job_id),
    ['B']
  );
  assert.deepEqual(selectResumableOcrJobs(all, null), [], 'no session, no jobs');
});

test('S5: a legacy row with no owner is polled once, never assumed', () => {
  upsertOcrJob(storedJob('L', null));
  const ids = selectResumableOcrJobs(loadOcrJobs().value, 'user-a').map((job) => job.job_id);
  assert.deepEqual(ids, ['L'], 'selected only so a single GET can prove whose it is');
});

test('S8: a previous NOT_FOUND does not keep the job out of the circuit', () => {
  // The backend answered 404 while another account was signed in.
  upsertOcrJob(
    storedJob('N', 'user-a', { last_status: 'failed', last_error_code: 'NOT_FOUND' })
  );
  // A real backend failure is a verdict on the job and must stop polling.
  upsertOcrJob(
    storedJob('F', 'user-a', { last_status: 'failed', last_error_code: 'BACKEND_FAILED' })
  );

  const ids = selectResumableOcrJobs(loadOcrJobs().value, 'user-a').map((job) => job.job_id);
  assert.ok(ids.includes('N'), '404 by ownership is a session fact, not a job outcome');
  assert.ok(!ids.includes('F'), 'a real failure is not retried forever');
});

test('S4: a confirmed quarantine is not resumed again', () => {
  upsertOcrJob(storedJob('Q', 'user-a', { quarantine_dispatched: true, pendiente_id: 7 }));
  assert.deepEqual(selectResumableOcrJobs(loadOcrJobs().value, 'user-a'), []);
});

test('session error codes are the three the backend uses', () => {
  assert.equal(isOcrSessionErrorCode('NOT_FOUND'), true);
  assert.equal(isOcrSessionErrorCode('UNAUTHORIZED'), true);
  assert.equal(isOcrSessionErrorCode('FORBIDDEN'), true);
  assert.equal(isOcrSessionErrorCode('BACKEND_FAILED'), false);
  assert.equal(isOcrSessionErrorCode(null), false);
});

test('the local terminal list cannot drift from types.ts', () => {
  assert.deepEqual([...OCR_STORAGE_TERMINAL_STATUSES].sort(), [...OCR_TERMINAL_STATUSES].sort());
});

test('S9: switching A -> B -> A dispatches each job exactly once', async () => {
  upsertOcrJob(storedJob('A', 'user-a'));
  upsertOcrJob(storedJob('B', 'user-b'));

  const created = [];

  // Signed in as A: only A is followed.
  const asA = makeDispatcher(created);
  const aJobs = selectResumableOcrJobs(loadOcrJobs().value, 'user-a');
  assert.deepEqual(aJobs.map((job) => job.job_id), ['A']);
  await asA.dispatch(finishedJob(aJobs[0], 'needs_review'));
  assert.deepEqual(created, ['A'], 'B was never polled while A was signed in');

  // Signed in as B: only B is followed, and A keeps its row.
  const asB = makeDispatcher(created);
  const bJobs = selectResumableOcrJobs(loadOcrJobs().value, 'user-b');
  assert.deepEqual(bJobs.map((job) => job.job_id), ['B']);
  await asB.dispatch(finishedJob(bJobs[0], 'needs_review'));
  assert.deepEqual(created, ['A', 'B']);

  // Back to A: A already confirmed its quarantine, so nothing is resumed twice.
  assert.deepEqual(selectResumableOcrJobs(loadOcrJobs().value, 'user-a'), []);
  assert.deepEqual(selectResumableOcrJobs(loadOcrJobs().value, 'user-b'), []);
  assert.deepEqual(created, ['A', 'B'], 'still exactly one row per job');
});

test('S9/S8: after a 404 the owner returning resumes and dispatches once', async () => {
  upsertOcrJob(storedJob('X', 'user-a'));

  // Another account polls: 404, recorded as a session error, job kept.
  patchOcrJob('X', { last_status: 'failed', last_error_code: 'NOT_FOUND' });
  assert.deepEqual(selectResumableOcrJobs(loadOcrJobs().value, 'user-b'), []);

  // Owner returns: the job is still resumable and dispatches exactly once.
  const created = [];
  const dispatcher = makeDispatcher(created);
  const resumable = selectResumableOcrJobs(loadOcrJobs().value, 'user-a');
  assert.deepEqual(resumable.map((job) => job.job_id), ['X']);

  const job = finishedJob(resumable[0], 'needs_review');
  await Promise.all([dispatcher.dispatch(job), dispatcher.dispatch(job)]);

  assert.deepEqual(created, ['X'], 'the 404 did not block the later dispatch');
  patchOcrJob('X', { last_error_code: null });
  assert.deepEqual(selectResumableOcrJobs(loadOcrJobs().value, 'user-a'), []);
});

test('S10: several simultaneous jobs of the same user each dispatch once', async () => {
  upsertOcrJob(storedJob('A', 'user-a'));
  upsertOcrJob(storedJob('B', 'user-a'));
  upsertOcrJob(storedJob('C', 'user-a'));

  const created = [];
  const dispatcher = makeDispatcher(created);
  const resumable = selectResumableOcrJobs(loadOcrJobs().value, 'user-a');
  assert.equal(resumable.length, 3);

  // A and C finish almost at once; B keeps processing and must not interfere.
  const a = finishedJob(resumable[0], 'completed');
  const c = finishedJob(resumable[2], 'needs_review');
  const results = await Promise.all([
    dispatcher.dispatch(a),
    dispatcher.dispatch(c),
    dispatcher.dispatch(a),
    dispatcher.dispatch(c),
  ]);

  assert.deepEqual(results, [true, true, true, true]);
  assert.deepEqual([...created].sort(), ['A', 'C']);
  assert.equal(created.filter((id) => id === 'A').length, 1);
  assert.equal(created.filter((id) => id === 'C').length, 1);

  // B was never touched by A or C finishing.
  const bRow = loadOcrJobs().value.find((job) => job.job_id === 'B');
  assert.equal(bRow.quarantine_dispatched, false);
  assert.equal(bRow.pendiente_id, null);
});
