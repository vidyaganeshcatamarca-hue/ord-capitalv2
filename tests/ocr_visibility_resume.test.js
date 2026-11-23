// tests/ocr_visibility_resume.test.js
// ============================================
// OCR polling: coming back to the foreground MUST re-ask the backend
// ============================================
// The scenario the owner asked to pin:
//   1. the job is locally `processing`;
//   2. the tab goes to the background;
//   3. polling is paused (not cancelled);
//   4. the backend finishes as `needs_review`;
//   5. the user comes back.
// Foreground must produce a real GET, discover `needs_review`, and dispatch the
// quarantine exactly once — even though locally the job still said `processing`.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { register } from 'node:module';

import { createOcrDispatcher } from '../src/ocr/dispatch.ts';

// Registered before the dynamic import below, so `polling.ts` can resolve its
// extensionless `./apiClient` import exactly as the bundler does.
register(new URL('./support/resolve-ts.mjs', import.meta.url));
const { runOcrPollingLoop } = await import('../src/ocr/polling.ts');

/** Minimal document stand-in: only what the polling loop touches. */
function installFakeDocument() {
  const listeners = new Map();
  const doc = {
    visibilityState: 'visible',
    addEventListener(type, handler) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
    removeEventListener(type, handler) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((entry) => entry !== handler)
      );
    },
  };
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
  return {
    setVisibility(state) {
      doc.visibilityState = state;
      for (const handler of listeners.get('visibilitychange') ?? []) handler();
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length;
    },
  };
}

/** Lets the async `tick()` settle without waiting on a real backoff. */
async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function jobWith(status) {
  return {
    job_id: 'J',
    status,
    stage: null,
    issues: [],
    ticket:
      status === 'needs_review'
        ? { ocr_schema_version: 1, ocr_job_id: 'J', merchant: 'Carrefour', purchase_date: null, currency: 'ARS', total: 6490, general_discount: 0, items: [{ item_index: 0, description: 'x', quantity: null, unit_price: null, printed_amount: 6490, discounts: [], net_amount: 6490, original_category_id: null, current_category_id: null, issues: [] }], issues: [], payment: { type: null, wallet_id: null, card_id: null, installments: null, currency: null } }
        : null,
    raw_result: null,
    error_code: null,
    message_code: null,
    created_at: '2026-11-06T00:00:00.000Z',
    updated_at: '2026-11-06T00:00:00.000Z',
  };
}

let cleanup = null;

afterEach(() => {
  if (cleanup) cleanup();
  cleanup = null;
  delete globalThis.document;
});

test('processing local -> background -> backend needs_review -> foreground -> GET -> dispatch once', async () => {
  const fake = installFakeDocument();

  const fetched = [];
  const created = [];
  let backendStatus = 'processing';
  let resultCalls = 0;
  let stopped = 0;

  const dispatcher = createOcrDispatcher({
    createQuarantine: async ({ jobId }) => {
      created.push(jobId);
      return { pendiente_id: created.length };
    },
    onTerminalPersisted: () => {},
    onDispatched: () => {},
    onFailed: () => {},
  });

  const controller = runOcrPollingLoop({
    jobId: 'J',
    accessToken: 'token',
    fetchJob: async ({ jobId }) => {
      fetched.push(backendStatus);
      return jobWith(backendStatus) && { ...jobWith(backendStatus), job_id: jobId };
    },
    onUpdate: () => {},
    onResult: (job) => {
      resultCalls += 1;
      void dispatcher.dispatch(job);
    },
    onStopped: () => {
      stopped += 1;
    },
  });
  cleanup = () => controller.cancel();

  // Nothing was asked yet: the first tick waits for the backoff.
  assert.deepEqual(fetched, []);

  // Tab goes to the background: paused, no network.
  fake.setVisibility('hidden');
  await flush();
  assert.deepEqual(fetched, [], 'a hidden tab never polls');

  // Back to the foreground while the backend still says processing.
  fake.setVisibility('visible');
  await flush();
  assert.deepEqual(fetched, ['processing'], 'foreground produced a real GET');
  assert.equal(resultCalls, 0);

  // Background again. Meanwhile the backend finishes the ticket.
  fake.setVisibility('hidden');
  backendStatus = 'needs_review';
  await flush();
  assert.deepEqual(fetched, ['processing'], 'still no polling while hidden');

  // The owner returns: the GET discovers needs_review and the ticket lands.
  fake.setVisibility('visible');
  await flush();

  assert.deepEqual(fetched, ['processing', 'needs_review'], 'foreground re-asked the backend');
  assert.equal(resultCalls, 1, 'the terminal was delivered once');
  assert.deepEqual(created, ['J'], 'exactly one quarantine row');
  assert.equal(stopped, 0, 'the loop was not stopped');
});

test('the loop keeps its listener across a full hidden/visible cycle', async () => {
  const fake = installFakeDocument();
  const controller = runOcrPollingLoop({
    jobId: 'J',
    accessToken: 'token',
    fetchJob: async () => jobWith('processing'),
    onResult: () => {},
    onStopped: () => {},
  });
  cleanup = () => controller.cancel();

  assert.equal(fake.listenerCount('visibilitychange'), 1);
  fake.setVisibility('hidden');
  fake.setVisibility('visible');
  await flush();
  // Hiding pauses; it never detaches the listener or cancels the poller.
  assert.equal(fake.listenerCount('visibilitychange'), 1);

  controller.cancel();
  assert.equal(fake.listenerCount('visibilitychange'), 0, 'cancel is what detaches it');
});
