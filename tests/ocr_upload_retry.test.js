// tests/ocr_upload_retry.test.js
//
// Only what never reached the server may be retried.
//
// The photos of every ticket stay on the phone for seven days so the owner can
// look at a saved ticket. That means IndexedDB holds photos of tickets that
// already travelled. Re-sending them would create a second ticket for the same
// receipt, so the retry is selected by flag and never by "what is on disk".

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  OCR_HISTORY_LIMIT,
  OCR_HISTORY_STORAGE_KEY,
  OCR_HISTORY_UNSENT_STATUSES,
  selectPendingUploadEntries,
  recordOcrHistory,
  loadOcrHistory,
  patchOcrHistory,
} from '../src/ocr/history.ts'

class FakeStorage {
  constructor() {
    this.map = new Map()
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }
  setItem(key, value) {
    this.map.set(key, String(value))
  }
  removeItem(key) {
    this.map.delete(key)
  }
}

beforeEach(() => {
  globalThis.localStorage = new FakeStorage()
})

function entry(id, status, createdAt, overrides = {}) {
  return {
    job_id: id,
    created_at: createdAt,
    image_count: 2,
    status,
    updated_at: createdAt,
    pendiente_id: null,
    ...overrides,
  }
}

test('only unsent statuses are retryable', () => {
  assert.deepEqual([...OCR_HISTORY_UNSENT_STATUSES], ['upload_pending', 'upload_failed'])
})

test('a ticket that already reached the server is never retried', () => {
  const entries = [
    entry('a', 'upload_pending', '2026-11-17T10:00:00Z'),
    entry('b', 'upload_failed', '2026-11-17T09:00:00Z'),
    // Everything below already has a server job_id. Its photos are still on the
    // phone only so the owner can look at them.
    entry('c', 'processing', '2026-11-17T08:00:00Z'),
    entry('d', 'classified', '2026-11-17T07:00:00Z'),
    entry('e', 'quarantine', '2026-11-17T06:00:00Z'),
    entry('f', 'approved', '2026-11-17T05:00:00Z', { pendiente_id: 1586 }),
    entry('g', 'rejected', '2026-11-17T04:00:00Z'),
  ]

  const retry = selectPendingUploadEntries(entries)

  assert.deepEqual(retry.map((r) => r.job_id), ['a', 'b'])
})

test('an approved ticket with photos still on disk is not re-uploaded', () => {
  const approved = entry('f', 'approved', '2026-11-16T05:00:00Z', { pendiente_id: 1586 })
  assert.equal(selectPendingUploadEntries([approved]).length, 0)
})

test('the history trim never drops a ticket that has not been sent', () => {
  // Fill the history to its limit with finished work.
  for (let i = 0; i < OCR_HISTORY_LIMIT; i += 1) {
    recordOcrHistory(
      entry(`done-${i}`, 'approved', `2026-11-10T0${i}:00:00Z`, { pendiente_id: 100 + i }),
    )
  }

  // One unsent upload created earlier than all of them: a plain slice by recency
  // would push it out on the next insert.
  recordOcrHistory(entry('unsent', 'upload_pending', '2026-11-01T00:00:00Z'))

  // And one more finished upload to force the trim.
  recordOcrHistory(entry('newer', 'processing', '2026-11-17T00:00:00Z'))

  const kept = loadOcrHistory().value.map((e) => e.job_id)
  assert.equal(kept.includes('unsent'), true, 'the unsent upload must survive the trim')
  assert.equal(selectPendingUploadEntries(loadOcrHistory().value).length, 1)
})

test('an upload that succeeds stops being retryable', () => {
  recordOcrHistory(entry('x', 'upload_pending', '2026-11-17T10:00:00Z'))
  assert.equal(selectPendingUploadEntries(loadOcrHistory().value).length, 1)

  patchOcrHistory('x', { status: 'processing' })

  assert.equal(selectPendingUploadEntries(loadOcrHistory().value).length, 0)
  assert.equal(loadOcrHistory().value[0].status, 'processing')
})

test('the history key is stable', () => {
  assert.equal(OCR_HISTORY_STORAGE_KEY, 'ord.ocr.v1.history')
})
