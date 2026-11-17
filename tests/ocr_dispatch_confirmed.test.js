// tests/ocr_dispatch_confirmed.test.js
//
// A confirmed quarantine is final.
//
// The audit found that `onFailed` wrote `quarantine_dispatched: false` on every
// dispatch error, with no check of `pendiente_id`. After a successful RPC, a later
// failure (a retry, a flaky network) reopened the job: it came back into the
// recovery set and the next reconciliation re-dispatched a ticket that was already
// waiting for review. `23b4d4d0` (pendiente_id 1586) is the real-world shape of a
// confirmed job: the invariant here is what keeps it closed.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createOcrDispatcher,
  failedDispatchPatch,
} from '../src/ocr/dispatch.ts'
import { selectResumableOcrJobs } from '../src/ocr/storage.ts'

const OWNER = '54db30d1d4'

function job(overrides = {}) {
  return {
    job_id: '23b4d4d0-1047-4552-96f7-02554d931200',
    status: 'completed',
    stage: 'completed',
    issues: [],
    ticket: { merchant: 'Carrefour Maxi Catamarca', items: [], issues: [], total: 105879.55 },
    raw_result: { engine_version: 'x' },
    created_at: '2026-11-14T22:24:32Z',
    ...overrides,
  }
}

function storedJob(overrides = {}) {
  return {
    job_id: '23b4d4d0-1047-4552-96f7-02554d931200',
    owner_user_id: OWNER,
    created_at: '2026-11-14T22:24:32Z',
    last_status: 'completed',
    last_stage: 'completed',
    last_checked_at: '2026-11-15T01:33:26.540Z',
    last_successful_poll_at: '2026-11-15T01:33:26.540Z',
    quarantine_dispatched: true,
    pendiente_id: 1586,
    last_error_code: null,
    last_error_at: null,
    server_created_at: '2026-11-14T22:24:32Z',
    quarantine_dispatched_at: '2026-11-15T01:33:26.970Z',
    ...overrides,
  }
}

/** Dispatcher wired to in-memory deps, the same shape the hook builds. */
function makeDispatcher(calls) {
  return createOcrDispatcher({
    createQuarantine: async ({ jobId }) => {
      calls.push(['createQuarantine', jobId])
      return { pendiente_id: 1586 }
    },
    onTerminalPersisted: (j) => calls.push(['onTerminalPersisted', j.job_id]),
    onDispatched: (j, pendienteId) => calls.push(['onDispatched', pendienteId]),
    onFailed: (j, code) => calls.push(['onFailed', code]),
  })
}

test('1. a successful dispatch confirms the row with a real pendiente_id', async () => {
  const calls = []
  const dispatcher = makeDispatcher(calls)

  const ok = await dispatcher.dispatch(job())

  assert.equal(ok, true)
  assert.deepEqual(calls.find((c) => c[0] === 'onDispatched'), ['onDispatched', 1586])
  assert.equal(calls.some((c) => c[0] === 'onFailed'), false)
})

test('2. onFailed does not degrade a confirmed job', () => {
  const patch = failedDispatchPatch({ status: 'completed', pendienteId: 1586 })

  // The confirmed flag is simply absent: the caller cannot rewrite it to false.
  assert.equal('quarantine_dispatched' in patch, false)
  assert.equal(patch.last_status, 'completed')
})

test('3. a job without pendiente_id is still released on a real failure', () => {
  const patch = failedDispatchPatch({ status: 'completed', pendienteId: null })

  assert.equal(patch.quarantine_dispatched, false)
  assert.equal(patch.last_status, 'completed')
})

test('4. a confirmed job never returns to the recovery set', () => {
  const confirmed = storedJob()

  // With the old `onFailed` behaviour the flag became false and this list held it
  // again, which is what produced the re-dispatch.
  assert.deepEqual(selectResumableOcrJobs([confirmed], OWNER), [])

  // Applying the fixed patch leaves the job closed exactly as before.
  const patched = { ...confirmed, ...failedDispatchPatch({ status: 'completed', pendienteId: confirmed.pendiente_id }) }
  assert.equal(patched.quarantine_dispatched, true)
  assert.equal(patched.pendiente_id, 1586)
  assert.deepEqual(selectResumableOcrJobs([patched], OWNER), [])

  // Control: the degraded state DOES reopen it, which is the defect being pinned.
  const degraded = { ...confirmed, quarantine_dispatched: false }
  assert.equal(selectResumableOcrJobs([degraded], OWNER).length, 1)
})
