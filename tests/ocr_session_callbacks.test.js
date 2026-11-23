// tests/ocr_session_callbacks.test.js
// ============================================
// OCR - a poll callback must not act for a session that already ended
// ============================================
// The race: user A starts polling job A, the request stays in flight, the app
// switches to user B, and A's old response arrives. That response must not touch
// B's visible state, must not create a quarantine row under B, and must not
// rewrite the stored job.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isStaleSessionCallback } from '../src/ocr/sessionGuard.ts';
import { createOcrDispatcher } from '../src/ocr/dispatch.ts';

function finishedJob(jobId) {
  return {
    job_id: jobId,
    status: 'needs_review',
    created_at: '2026-11-06T00:00:00.000Z',
    ticket: { items: [{ n: 1 }], issues: [] },
    raw_result: { ok: true },
  };
}

/**
 * Mirrors the hook: a callback carries the owner captured when the poll started,
 * and only runs its body when that owner is still the active one.
 */
function deliverCallback({ pollSessionOwner, activeSessionOwner, job, dispatcher, effects }) {
  if (isStaleSessionCallback(pollSessionOwner, activeSessionOwner)) {
    effects.skipped += 1;
    return Promise.resolve(false);
  }
  effects.applied += 1;
  return dispatcher.dispatch(job);
}

function makeDispatcher(created) {
  return createOcrDispatcher({
    createQuarantine: async ({ jobId }) => {
      created.push(jobId);
      return { pendiente_id: created.length };
    },
    onTerminalPersisted: () => {},
    onDispatched: () => {},
    onFailed: () => {},
  });
}

test('the comparison is exact, including a missing session', () => {
  assert.equal(isStaleSessionCallback('user-a', 'user-a'), false);
  assert.equal(isStaleSessionCallback('user-a', 'user-b'), true);
  assert.equal(isStaleSessionCallback(null, 'user-b'), true);
  assert.equal(isStaleSessionCallback('user-a', null), true);
  assert.equal(isStaleSessionCallback(null, null), false);
});

test('A -> B: the old callback of A never creates a quarantine under B', async () => {
  const created = [];
  const effects = { applied: 0, skipped: 0 };
  const dispatcher = makeDispatcher(created);

  // A started this poll; by the time it answers, B is signed in.
  const delivered = await deliverCallback({
    pollSessionOwner: 'user-a',
    activeSessionOwner: 'user-b',
    job: finishedJob('job-of-A'),
    dispatcher,
    effects,
  });

  assert.equal(delivered, false, 'the stale callback returned without dispatching');
  assert.deepEqual(created, [], 'no quarantine row for B from A\'s ticket');
  assert.equal(effects.skipped, 1);
  assert.equal(effects.applied, 0);
});

test('the same callback does dispatch when its own session is still active', async () => {
  const created = [];
  const effects = { applied: 0, skipped: 0 };
  const dispatcher = makeDispatcher(created);

  const delivered = await deliverCallback({
    pollSessionOwner: 'user-a',
    activeSessionOwner: 'user-a',
    job: finishedJob('job-of-A'),
    dispatcher,
    effects,
  });

  assert.equal(delivered, true);
  assert.deepEqual(created, ['job-of-A']);
  assert.equal(effects.applied, 1);
  assert.equal(effects.skipped, 0);
});

test('A -> B -> A: the ticket of A lands only when A is back', async () => {
  const created = [];
  const job = finishedJob('job-of-A');
  const dispatcher = makeDispatcher(created);

  // Response arrives while B is active: dropped.
  await deliverCallback({
    pollSessionOwner: 'user-a',
    activeSessionOwner: 'user-b',
    job,
    dispatcher,
    effects: { applied: 0, skipped: 0 },
  });
  assert.deepEqual(created, []);

  // A returns and the poll runs again for A: exactly one row.
  await deliverCallback({
    pollSessionOwner: 'user-a',
    activeSessionOwner: 'user-a',
    job,
    dispatcher,
    effects: { applied: 0, skipped: 0 },
  });
  assert.deepEqual(created, ['job-of-A']);
});

test('signing out drops an in-flight callback instead of dispatching', async () => {
  const created = [];
  const dispatcher = makeDispatcher(created);

  const delivered = await deliverCallback({
    pollSessionOwner: 'user-a',
    activeSessionOwner: null,
    job: finishedJob('job-of-A'),
    dispatcher,
    effects: { applied: 0, skipped: 0 },
  });

  assert.equal(delivered, false);
  assert.deepEqual(created, []);
});
