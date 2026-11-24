// tests/ocr_history_retry.test.js
// Run: node --test tests/ocr_history_retry.test.js
//
// A rejected ticket must never look like one that is still processing, and the
// resend of the SAME photos must be capped: two attempts, no more. Taking new
// photos is a different job with a different counter, so the cap never limits
// the owner who decides to shoot the receipt again.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  OCR_HISTORY_MAX_MANUAL_RETRIES,
  OCR_HISTORY_STORAGE_KEY,
  acknowledgeRejectedOcrHistory,
  bumpOcrHistoryRetry,
  canRetryRejectedEntry,
  clearOcrHistory,
  loadOcrHistory,
  recordOcrHistory,
  selectUnseenRejectedEntries,
} from '../src/ocr/history.ts'

function installMemoryLocalStorage() {
  const data = new Map()
  const storage = {
    get length() {
      return data.size
    },
    key(index) {
      return [...data.keys()][index] ?? null
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem(key, value) {
      data.set(key, String(value))
    },
    removeItem(key) {
      data.delete(key)
    },
    clear() {
      data.clear()
    },
  }
  globalThis.localStorage = storage
  return { storage, data }
}

function entry(jobId, overrides = {}) {
  const now = new Date().toISOString()
  return {
    job_id: jobId,
    created_at: overrides.created_at ?? now,
    image_count: 3,
    status: 'rejected',
    updated_at: now,
    pendiente_id: null,
    ...overrides,
  }
}

beforeEach(() => {
  installMemoryLocalStorage()
  clearOcrHistory()
})

test('a rejected entry can be retried twice, then the cap closes', () => {
  recordOcrHistory(entry('job-1'))
  const first = bumpOcrHistoryRetry('job-1')
  assert.deepEqual(first, { retryCount: 1 })
  const second = bumpOcrHistoryRetry('job-1')
  assert.deepEqual(second, { retryCount: 2 })
  assert.equal(bumpOcrHistoryRetry('job-1'), null)
  assert.equal(OCR_HISTORY_MAX_MANUAL_RETRIES, 2)
})

test('the cap is expressed by canRetry, not only by the counter', () => {
  recordOcrHistory(entry('job-2'))
  assert.equal(canRetryRejectedEntry(loadOcrHistory().value[0]), true)
  bumpOcrHistoryRetry('job-2')
  bumpOcrHistoryRetry('job-2')
  assert.equal(canRetryRejectedEntry(loadOcrHistory().value[0]), false)
})

test('a dispatched quarantine blocks the retry even with counter left', () => {
  recordOcrHistory(entry('job-3'))
  const row = loadOcrHistory().value[0]
  assert.equal(canRetryRejectedEntry(row, true), false)
})

test('an entry that is not rejected can never be retried', () => {
  recordOcrHistory(entry('job-4', { status: 'approved' }))
  assert.equal(canRetryRejectedEntry(loadOcrHistory().value[0]), false)
})

test('an unseen rejection is listed until the owner opens the list', () => {
  recordOcrHistory(entry('job-5'))
  assert.equal(selectUnseenRejectedEntries(loadOcrHistory().value).length, 1)
  const result = acknowledgeRejectedOcrHistory()
  assert.equal(result.acknowledged, 1)
  assert.equal(selectUnseenRejectedEntries(loadOcrHistory().value).length, 0)
  // Acknowledging twice is harmless.
  assert.equal(acknowledgeRejectedOcrHistory().acknowledged, 0)
})

test('trimming never drops a rejection the owner has not read', () => {
  // The unseen rejection is the OLDEST row: without the guard it would be the
  // first thing the limit throws away.
  recordOcrHistory(
    entry('old-failed', { created_at: '2020-01-01T00:00:00.000Z' }),
  )
  for (let i = 0; i < 8; i += 1) {
    recordOcrHistory(
      entry(`fresh-${i}`, {
        status: 'approved',
        created_at: `2026-01-0${i + 1}T00:00:00.000Z`,
      }),
    )
  }
  const kept = loadOcrHistory().value.map(row => row.job_id)
  assert.ok(kept.includes('old-failed'), `unseen rejection was trimmed: ${kept.join(',')}`)
})

test('once read, an old rejection may be trimmed like any other row', () => {
  recordOcrHistory(entry('old-failed', { created_at: '2020-01-01T00:00:00.000Z' }))
  acknowledgeRejectedOcrHistory()
  for (let i = 0; i < 8; i += 1) {
    recordOcrHistory(
      entry(`fresh-${i}`, {
        status: 'approved',
        created_at: `2026-01-0${i + 1}T00:00:00.000Z`,
      }),
    )
  }
  const kept = loadOcrHistory().value.map(row => row.job_id)
  assert.ok(!kept.includes('old-failed'), 'a read row should be trimmable again')
})

test('the counter survives a reload', () => {
  recordOcrHistory(entry('job-6'))
  bumpOcrHistoryRetry('job-6')
  const raw = globalThis.localStorage.getItem(OCR_HISTORY_STORAGE_KEY)
  assert.ok(raw !== null)
  assert.equal(loadOcrHistory().value[0].retry_count, 1)
})
