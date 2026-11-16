// tests/ocr_terminal_recovery.test.js
// ============================================
// OCR terminal recovery: `backend terminal` is not `frontend finished`
// ============================================
// Spark finished every job and every one got a 200 after reaching terminal, yet
// no quarantine row appeared. The cause was a contradiction between two filters:
// `selectResumableOcrJobs` discarded every terminal that was not a session error,
// and `retryPendingDispatches` asked precisely for those terminals. The retry
// could never see the row it was looking for.
//
// These regressions pin the corrected contract: a job is closed ONLY when
// `quarantine_dispatched === true && pendiente_id !== null`, and recovery always
// revalidates against the backend instead of replaying a stored object.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { createOcrDispatcher } from '../src/ocr/dispatch.ts';
import {
  OCR_STORAGE_DISPATCH_STATUSES,
  adoptOcrJobOwner,
  clearOcrJobError,
  loadOcrJobs,
  patchOcrJob,
  recordOcrJobError,
  selectResumableOcrJobs,
  upsertOcrJob,
} from '../src/ocr/storage.ts';
import { OCR_DISPATCH_STATUSES } from '../src/ocr/types.ts';

// `polling.ts` imports runtime values from './apiClient' without an extension,
// which the bundler resolves and Node's ESM loader does not.
register(new URL('./support/resolve-ts.mjs', import.meta.url));
const { runOcrPollingLoop } = await import('../src/ocr/polling.ts');

const OWNER = 'user-1';

// ---------------------------------------------------------------- fixtures

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

let visibilityHandlers = [];

function installFakeDocument() {
  visibilityHandlers = [];
  Object.defineProperty(globalThis, 'document', {
    value: {
      visibilityState: 'visible',
      addEventListener: (type, handler) => {
        if (type === 'visibilitychange') visibilityHandlers.push(handler);
      },
      removeEventListener: (type, handler) => {
        if (type === 'visibilitychange') {
          visibilityHandlers = visibilityHandlers.filter((entry) => entry !== handler);
        }
      },
    },
    configurable: true,
    writable: true,
  });
}

/** Forces the loop's first tick without waiting for the 2s backoff. */
function forceTick() {
  globalThis.document.visibilityState = 'hidden';
  for (const handler of [...visibilityHandlers]) handler();
  globalThis.document.visibilityState = 'visible';
  for (const handler of [...visibilityHandlers]) handler();
}

async function flush() {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function storedJob(jobId, owner, overrides = {}) {
  return {
    job_id: jobId,
    owner_user_id: owner,
    created_at: '2026-11-13T00:00:00.000Z',
    last_status: null,
    last_stage: null,
    last_checked_at: null,
    quarantine_dispatched: false,
    pendiente_id: null,
    last_error_code: null,
    last_error_at: null,
    last_successful_poll_at: null,
    server_created_at: null,
    quarantine_dispatched_at: null,
    ...overrides,
  };
}

function ticket() {
  return {
    ocr_schema_version: 1,
    ocr_job_id: 'job',
    merchant: 'Carrefour',
    purchase_date: null,
    currency: 'ARS',
    total: 1000,
    general_discount: 0,
    items: [
      {
        item_index: 0,
        description: 'item',
        quantity: null,
        unit_price: null,
        printed_amount: 1000,
        discounts: [],
        net_amount: 1000,
        original_category_id: null,
        current_category_id: null,
        issues: [],
      },
    ],
    issues: [],
    payment: {
      type: null,
      wallet_id: null,
      card_id: null,
      installments: null,
      currency: null,
    },
  };
}

function jobPayload(jobId, status, parsedTicket) {
  return {
    job_id: jobId,
    status,
    stage: null,
    issues: [],
    ticket: parsedTicket,
    raw_result: parsedTicket,
    error_code: null,
    message_code: null,
    created_at: '2026-11-13T00:00:00.000Z',
    updated_at: '2026-11-13T00:00:00.000Z',
  };
}

function byId(jobId) {
  return loadOcrJobs().value.find((job) => job.job_id === jobId);
}

/** Shared quarantine sink so a test can count exactly how many rows landed. */
let createdRows = [];
let failNextRpc = false;

function makeDispatcher() {
  return createOcrDispatcher({
    createQuarantine: async ({ jobId }) => {
      if (failNextRpc) {
        failNextRpc = false;
        throw Object.assign(new Error('rpc failed'), { code: 'DISPATCH_FAILED' });
      }
      createdRows.push(jobId);
      return { pendiente_id: createdRows.length };
    },
    onTerminalPersisted: (job) => {
      patchOcrJob(job.job_id, {
        last_status: job.status,
        last_checked_at: new Date().toISOString(),
      });
    },
    onDispatched: (job, pendienteId) => {
      patchOcrJob(job.job_id, {
        last_status: job.status,
        last_checked_at: new Date().toISOString(),
        quarantine_dispatched: true,
        pendiente_id: pendienteId,
        last_error_code: null,
        server_created_at: job.created_at || null,
        quarantine_dispatched_at: new Date().toISOString(),
      });
    },
    onFailed: (job, code) => {
      patchOcrJob(job.job_id, {
        last_status: job.status,
        quarantine_dispatched: false,
      });
      recordOcrJobError(job.job_id, code);
    },
  });
}

/**
 * One reconciliation attempt, wired exactly like `startPolling` does it:
 * `onPolled` runs on every 200 (adoption + trace), `onResult` dispatches.
 */
async function pollOnce({ jobId, status, parsedTicket, owner = OWNER }) {
  installFakeDocument();
  const dispatcher = makeDispatcher();
  const controller = runOcrPollingLoop({
    jobId,
    accessToken: 'token',
    fetchJob: async ({ jobId: id }) => jobPayload(id, status, parsedTicket),
    onPolled: (job) => {
      if (owner) adoptOcrJobOwner(jobId, owner);
      const now = new Date().toISOString();
      patchOcrJob(jobId, {
        last_status: job.status,
        last_stage: job.stage,
        last_checked_at: now,
        last_successful_poll_at: now,
        server_created_at: job.created_at || null,
      });
      clearOcrJobError(jobId);
    },
    onResult: (job) => {
      void dispatcher.dispatch(job);
    },
    onStopped: () => {},
  });
  forceTick();
  await flush();
  controller.cancel();
}

beforeEach(() => {
  installMemoryLocalStorage();
  createdRows = [];
  failNextRpc = false;
  visibilityHandlers = [];
});

// ---------------------------------------------------------------- tests

test('storage mirrors the dispatch list, so the selector cannot silently diverge', () => {
  assert.deepEqual([...OCR_STORAGE_DISPATCH_STATUSES], [...OCR_DISPATCH_STATUSES]);
});

test('A: a failed dispatch stays recoverable and the next GET dispatches it once', async () => {
  upsertOcrJob(
    storedJob('A', OWNER, { last_status: 'needs_review', last_error_code: 'DISPATCH_FAILED' })
  );

  // The selector must return it: a terminal that never landed is not closed.
  assert.deepEqual(
    selectResumableOcrJobs(loadOcrJobs().value, OWNER).map((job) => job.job_id),
    ['A']
  );

  failNextRpc = true;
  await pollOnce({ jobId: 'A', status: 'needs_review', parsedTicket: ticket() });

  let stored = byId('A');
  assert.equal(stored.quarantine_dispatched, false, 'the row still owes its quarantine');
  assert.equal(stored.pendiente_id, null);
  assert.equal(stored.last_error_code, 'DISPATCH_FAILED');
  assert.equal(createdRows.length, 0, 'no quarantine row was created');

  // Still selectable after the failure: this is the rule that was missing.
  assert.deepEqual(
    selectResumableOcrJobs(loadOcrJobs().value, OWNER).map((job) => job.job_id),
    ['A']
  );

  // Reconciliation: a real GET, then exactly one successful dispatch.
  await pollOnce({ jobId: 'A', status: 'needs_review', parsedTicket: ticket() });

  stored = byId('A');
  assert.equal(stored.quarantine_dispatched, true);
  assert.equal(stored.pendiente_id, 1);
  assert.ok(stored.quarantine_dispatched_at, 'the confirmation stamp was written');
  assert.equal(stored.last_error_code, null, 'a successful dispatch clears the error');
  assert.deepEqual(createdRows, ['A'], 'exactly one quarantine row');
});

test('B: NO_TICKET keeps the job open and the next GET re-delivers a valid ticket', async () => {
  upsertOcrJob(storedJob('B', OWNER, { last_status: 'needs_review' }));

  // Terminal 200 whose normalized ticket is null.
  await pollOnce({ jobId: 'B', status: 'needs_review', parsedTicket: null });

  let stored = byId('B');
  assert.equal(stored.last_error_code, 'NO_TICKET');
  assert.equal(stored.quarantine_dispatched, false, 'a malformed result never closes a job');
  assert.equal(stored.pendiente_id, null);
  assert.deepEqual(
    selectResumableOcrJobs(loadOcrJobs().value, OWNER).map((job) => job.job_id),
    ['B'],
    'NO_TICKET must remain recoverable'
  );

  // Next reconciliation: the backend now returns a usable ticket.
  await pollOnce({ jobId: 'B', status: 'needs_review', parsedTicket: ticket() });

  stored = byId('B');
  assert.equal(stored.quarantine_dispatched, true);
  assert.equal(stored.last_error_code, null);
  assert.deepEqual(createdRows, ['B'], 'exactly one quarantine row');
});

test('C: legacy without owner adopts on a terminal needs_review GET and dispatches once', async () => {
  upsertOcrJob(storedJob('C', null, { last_status: null }));
  assert.equal(byId('C').owner_user_id, null, 'legacy row starts with no owner');

  // A legacy row is polled once even without an owner, so a 200 can prove it.
  assert.deepEqual(
    selectResumableOcrJobs(loadOcrJobs().value, OWNER).map((job) => job.job_id),
    ['C']
  );

  await pollOnce({ jobId: 'C', status: 'needs_review', parsedTicket: ticket() });

  const stored = byId('C');
  assert.equal(stored.owner_user_id, OWNER, 'a terminal 200 also adopts the owner');
  assert.equal(stored.quarantine_dispatched, true);
  assert.equal(stored.pendiente_id, 1);
  assert.deepEqual(createdRows, ['C'], 'exactly one quarantine row');
});

test('D: legacy without owner adopts on a terminal completed GET too', async () => {
  upsertOcrJob(storedJob('D', null, { last_status: null }));

  await pollOnce({ jobId: 'D', status: 'completed', parsedTicket: ticket() });

  const stored = byId('D');
  assert.equal(stored.owner_user_id, OWNER);
  assert.equal(stored.last_status, 'completed');
  assert.equal(stored.quarantine_dispatched, true);
  assert.equal(stored.pendiente_id, 1);
  assert.deepEqual(createdRows, ['D'], 'exactly one quarantine row');
});

test('E: a terminal GET counts as a successful poll', async () => {
  upsertOcrJob(
    storedJob('E', OWNER, {
      last_status: 'needs_review',
      last_successful_poll_at: '2026-11-01T00:00:00.000Z',
    })
  );

  await pollOnce({ jobId: 'E', status: 'needs_review', parsedTicket: ticket() });

  const stored = byId('E');
  assert.notEqual(stored.last_successful_poll_at, '2026-11-01T00:00:00.000Z');
  assert.ok(
    Date.parse(stored.last_successful_poll_at) > Date.parse('2026-11-01T00:00:00.000Z'),
    'the terminal GET moves the success stamp'
  );
});

test('F: a confirmed quarantine is never selected or dispatched again', async () => {
  upsertOcrJob(
    storedJob('F', OWNER, {
      last_status: 'needs_review',
      quarantine_dispatched: true,
      pendiente_id: 42,
      quarantine_dispatched_at: '2026-11-13T00:00:00.000Z',
    })
  );

  assert.deepEqual(selectResumableOcrJobs(loadOcrJobs().value, OWNER), []);

  // The retry selector (same rules + the dispatch-status filter) yields nothing.
  const pending = selectResumableOcrJobs(loadOcrJobs().value, OWNER).filter(
    (job) =>
      !job.quarantine_dispatched &&
      job.last_status !== null &&
      OCR_DISPATCH_STATUSES.includes(job.last_status)
  );
  assert.deepEqual(pending, []);
});

test('G: a session error never deletes or permanently closes the job', async () => {
  // A 404 recorded while the owner was signed out.
  upsertOcrJob(
    storedJob('G', OWNER, { last_status: null, last_error_code: 'NOT_FOUND' })
  );

  let stored = byId('G');
  assert.equal(stored.quarantine_dispatched, false);
  assert.deepEqual(
    selectResumableOcrJobs(loadOcrJobs().value, OWNER).map((job) => job.job_id),
    ['G'],
    'a 404 is session state, not a job verdict'
  );

  // Even if a previous version persisted it as `failed`, it stays selectable.
  patchOcrJob('G', { last_status: 'failed', last_error_code: 'NOT_FOUND' });
  stored = byId('G');
  assert.equal(stored.last_status, 'failed');
  assert.deepEqual(
    selectResumableOcrJobs(loadOcrJobs().value, OWNER).map((job) => job.job_id),
    ['G'],
    'a session-blocked terminal is still recoverable'
  );

  // And the real owner signing back in gets the ticket dispatched.
  await pollOnce({ jobId: 'G', status: 'needs_review', parsedTicket: ticket() });
  stored = byId('G');
  assert.equal(stored.quarantine_dispatched, true);
  assert.deepEqual(createdRows, ['G'], 'exactly one quarantine row');
});
