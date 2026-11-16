// tests/ocr_history.test.js
// ============================================
// Historial local de los ultimos envios OCR
// ============================================
// El dueño necesita ver que paso con sus ultimos tickets sin depender de las
// tablas: los envios viven en el telefono, sobreviven a la cuarentena y no
// desaparecen cuando el job se confirma o se rechaza.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  OCR_HISTORY_LIMIT,
  OCR_HISTORY_STORAGE_KEY,
  clearOcrHistory,
  loadOcrHistory,
  patchOcrHistory,
  recordOcrHistory,
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
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  return data
}

const entry = (id, overrides = {}) => ({
  job_id: id,
  created_at: '2026-11-05T12:00:00.000Z',
  image_count: 2,
  status: 'processing',
  updated_at: '2026-11-05T12:00:00.000Z',
  pendiente_id: null,
  ...overrides,
})

beforeEach(() => {
  installMemoryLocalStorage()
})

test('guarda un envio y lo devuelve', () => {
  recordOcrHistory(entry('job-1', { image_count: 3 }))
  const { value } = loadOcrHistory()
  assert.equal(value.length, 1)
  assert.equal(value[0].job_id, 'job-1')
  assert.equal(value[0].image_count, 3)
})

test('el mas reciente queda primero', () => {
  recordOcrHistory(entry('viejo', { created_at: '2026-11-01T10:00:00.000Z' }))
  recordOcrHistory(entry('nuevo', { created_at: '2026-11-05T10:00:00.000Z' }))
  assert.deepEqual(loadOcrHistory().value.map((e) => e.job_id), ['nuevo', 'viejo'])
})

test('solo conserva los ultimos cinco', () => {
  for (let i = 1; i <= 7; i++) {
    recordOcrHistory(entry(`job-${i}`, { created_at: `2026-11-0${i}T10:00:00.000Z` }))
  }
  const { value } = loadOcrHistory()
  assert.equal(value.length, OCR_HISTORY_LIMIT)
  assert.deepEqual(value.map((e) => e.job_id), ['job-7', 'job-6', 'job-5', 'job-4', 'job-3'])
})

test('el mismo job no se duplica', () => {
  recordOcrHistory(entry('job-1', { status: 'processing' }))
  recordOcrHistory(entry('job-1', { status: 'quarantine' }))
  const { value } = loadOcrHistory()
  assert.equal(value.length, 1)
  assert.equal(value[0].status, 'quarantine')
})

test('patch cambia el estado de un envio existente', () => {
  recordOcrHistory(entry('job-1'))
  patchOcrHistory('job-1', { status: 'approved', pendiente_id: 1483 })
  const [saved] = loadOcrHistory().value
  assert.equal(saved.status, 'approved')
  assert.equal(saved.pendiente_id, 1483)
})

test('patch sobre un job desconocido no inventa entradas', () => {
  patchOcrHistory('fantasma', { status: 'approved' })
  assert.deepEqual(loadOcrHistory().value, [])
})

test('ignora entradas corruptas sin romper', () => {
  localStorage.setItem(
    OCR_HISTORY_STORAGE_KEY,
    JSON.stringify([{ nope: true }, { job_id: 'ok', created_at: '2026-11-05T10:00:00.000Z', image_count: 1, status: 'processing', updated_at: '2026-11-05T10:00:00.000Z', pendiente_id: null }]),
  )
  const { value } = loadOcrHistory()
  assert.equal(value.length, 1)
  assert.equal(value[0].job_id, 'ok')
})

test('basura total en storage devuelve lista vacia', () => {
  localStorage.setItem(OCR_HISTORY_STORAGE_KEY, 'no-es-json')
  assert.deepEqual(loadOcrHistory().value, [])
})

test('clear vacia el historial', () => {
  recordOcrHistory(entry('job-1'))
  clearOcrHistory()
  assert.deepEqual(loadOcrHistory().value, [])
})

test('el despacho deja el historial con el estado terminal, no con el viejo', () => {
  recordOcrHistory({
    job_id: 'job-dispatch',
    created_at: '2026-11-14T21:08:00.000Z',
    image_count: 3,
    status: 'processing',
    last_status: 'classifying',
    updated_at: '2026-11-14T21:08:00.000Z',
    pendiente_id: null,
  })

  // What onDispatched does once the quarantine row exists.
  patchOcrHistory('job-dispatch', {
    status: 'quarantine',
    last_status: 'needs_review',
    pendiente_id: 1483,
  })

  const [saved] = loadOcrHistory().value
  assert.equal(saved.status, 'quarantine')
  assert.equal(saved.last_status, 'needs_review', 'a stale classifying must not survive')
  assert.equal(saved.pendiente_id, 1483)
})
