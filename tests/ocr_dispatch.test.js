// tests/ocr_dispatch.test.js
// ============================================
// OCR quarantine dispatch: concurrency contract (S7-S15)
// ============================================
// Pins the behaviour the 00:53 incident broke: several finished jobs competing
// for the same tray must each create exactly one row, and no job may stop,
// block or overwrite another.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOcrDispatcher } from '../src/ocr/dispatch.ts';

/** Minimal finished OCR job, shaped like the real one. */
function makeJob(jobId, status, { withTicket = true } = {}) {
  return {
    job_id: jobId,
    status,
    created_at: '2026-11-06T00:00:00.000Z',
    ticket: withTicket ? { items: [{ n: 1 }, { n: 2 }], issues: [] } : null,
    raw_result: { ok: true },
  };
}

/**
 * Dispatcher with recording deps. `createQuarantine` awaits a tick so the three
 * jobs really interleave instead of resolving in call order.
 */
function makeDispatcher(overrides = {}) {
  const calls = { created: [], persisted: [], dispatched: [], failed: [], announced: 0 };
  let nextRow = 1;
  const dispatcher = createOcrDispatcher({
    createQuarantine: async ({ jobId }) => {
      calls.created.push(jobId);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { pendiente_id: nextRow++ };
    },
    onTerminalPersisted: (job) => calls.persisted.push(job.job_id),
    onDispatched: (job, pendienteId) => calls.dispatched.push({ jobId: job.job_id, pendienteId }),
    onFailed: (job, code) => calls.failed.push({ jobId: job.job_id, code }),
    announce: () => {
      calls.announced += 1;
    },
    ...overrides,
  });
  return { dispatcher, calls };
}

test('S15: B is dispatched once while A and C stay untouched', async () => {
  const { dispatcher, calls } = makeDispatcher();
  const A = makeJob('A', 'processing');
  const B = makeJob('B', 'needs_review');
  const C = makeJob('C', 'processing');

  // The same terminal delivered twice at once (StrictMode, duplicate poll).
  const results = await Promise.all([dispatcher.dispatch(B), dispatcher.dispatch(B)]);

  assert.deepEqual(results, [true, true]);
  assert.deepEqual(calls.created, ['B'], 'exactly one RPC for B');
  assert.deepEqual(
    calls.dispatched.map((entry) => entry.jobId),
    ['B'],
    'exactly one quarantine row for B'
  );
  assert.equal(calls.failed.length, 0, 'B never failed');

  // A and C are not finished: nothing about them may be written.
  assert.equal(calls.persisted.includes('A'), false);
  assert.equal(calls.persisted.includes('C'), false);
  assert.equal(calls.created.includes('A'), false);
  assert.equal(calls.created.includes('C'), false);
});

test('S15: A completed and C needs_review dispatch once each, almost simultaneously', async () => {
  const { dispatcher, calls } = makeDispatcher();
  const A = makeJob('A', 'completed');
  const C = makeJob('C', 'needs_review');

  const results = await Promise.all([
    dispatcher.dispatch(A),
    dispatcher.dispatch(C),
    dispatcher.dispatch(A),
    dispatcher.dispatch(C),
  ]);

  assert.deepEqual(results, [true, true, true, true]);
  assert.deepEqual([...calls.created].sort(), ['A', 'C'], 'one RPC per job, no more');
  assert.deepEqual(
    [...calls.dispatched.map((entry) => entry.jobId)].sort(),
    ['A', 'C'],
    'one quarantine row per job'
  );
  assert.equal(calls.announced, 2, 'each landed ticket announces once');
});

test('S10: completed and needs_review take exactly the same path', async () => {
  const run = async (status) => {
    const { dispatcher, calls } = makeDispatcher();
    await dispatcher.dispatch(makeJob('X', status));
    return calls;
  };

  const completed = await run('completed');
  const needsReview = await run('needs_review');

  assert.deepEqual(completed.persisted, needsReview.persisted);
  assert.deepEqual(completed.created, needsReview.created);
  assert.deepEqual(completed.dispatched, needsReview.dispatched);
  assert.deepEqual(completed.failed, needsReview.failed);
});

test('S11: the terminal state is persisted before the RPC runs', async () => {
  const persisted = [];
  let persistedBeforeRpc = null;
  const dispatcher = createOcrDispatcher({
    createQuarantine: async ({ jobId }) => {
      // Observed from inside the RPC: by now the finished job must be on disk.
      persistedBeforeRpc = persisted.includes(jobId);
      return { pendiente_id: 1 };
    },
    onTerminalPersisted: (job) => persisted.push(job.job_id),
    onDispatched: () => {},
    onFailed: () => {},
  });

  await dispatcher.dispatch(makeJob('J', 'needs_review'));
  assert.equal(persistedBeforeRpc, true, 'the finished job was on disk before the RPC');
});

test('S12: a failed RPC releases the guard and a retry lands the ticket', async () => {
  let attempts = 0;
  const calls = { dispatched: [], failed: [] };
  const dispatcher = createOcrDispatcher({
    createQuarantine: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('boom');
        error.code = 'RPC_FAILED';
        throw error;
      }
      return { pendiente_id: 42 };
    },
    onTerminalPersisted: () => {},
    onDispatched: (job, pendienteId) => calls.dispatched.push({ jobId: job.job_id, pendienteId }),
    onFailed: (job, code) => calls.failed.push({ jobId: job.job_id, code }),
  });

  const job = makeJob('R', 'needs_review');
  assert.equal(await dispatcher.dispatch(job), false);
  assert.deepEqual(calls.failed, [{ jobId: 'R', code: 'RPC_FAILED' }]);
  assert.equal(dispatcher.isInFlight('R'), false, 'guard released so a retry can run');

  assert.equal(await dispatcher.dispatch(job), true);
  assert.deepEqual(calls.dispatched, [{ jobId: 'R', pendienteId: 42 }]);
  assert.equal(attempts, 2);
});

test('S17: a finished job with no ticket fails loudly instead of hanging', async () => {
  const { dispatcher, calls } = makeDispatcher();
  const orphan = makeJob('N', 'needs_review', { withTicket: false });

  assert.equal(await dispatcher.dispatch(orphan), false);
  assert.deepEqual(calls.failed, [{ jobId: 'N', code: 'NO_TICKET' }]);
  assert.deepEqual(calls.created, [], 'no RPC attempted without a ticket');
  assert.equal(dispatcher.isInFlight('N'), false);
});

test('S7/S8: the guard is per job_id and reset clears every guard', async () => {
  const { dispatcher } = makeDispatcher();
  const slow = createOcrDispatcher({
    createQuarantine: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { pendiente_id: 1 };
    },
    onTerminalPersisted: () => {},
    onDispatched: () => {},
    onFailed: () => {},
  });

  const inFlight = slow.dispatch(makeJob('A', 'completed'));
  // A second, different job is never blocked by the first one being in flight.
  assert.equal(slow.isInFlight('A'), true);
  assert.equal(slow.isInFlight('B'), false);
  await inFlight;

  slow.reset();
  assert.equal(slow.isInFlight('A'), false);
  void dispatcher;
});
