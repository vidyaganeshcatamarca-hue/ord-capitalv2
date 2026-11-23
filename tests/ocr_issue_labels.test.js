// tests/ocr_issue_labels.test.js
//
// Regression: a Carrefour ticket showed "The system flagged data for review"
// twice in the quarantine tray. The card deduplicated issue CODES, but every
// backend code without a dedicated label resolves to the same sentence, so two
// different codes produced two identical chips.
//
// The contract under test: the owner reads each sentence once, order is kept,
// and codes that do have a dedicated label stay distinct.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveOcrIssueLabels } from '../src/ocr/issues.ts'

/** Minimal dictionary: known keys resolve, anything else echoes its key. */
function fakeTranslate(key) {
  const dictionary = {
    'ocr.issue_generic': 'El sistema marcó datos para revisar.',
    'ocr.issue_category_pending': 'Hay productos sin categoría.',
    'ocr.issue_payment_pending': 'Falta la forma de pago.',
  }
  return dictionary[key] ?? `[${key}]`
}

test('two different backend codes without a label collapse to one chip', () => {
  const labels = resolveOcrIssueLabels(
    ['amount_unreadable', 'merchant_missing'],
    fakeTranslate,
  )

  assert.deepEqual(labels, ['El sistema marcó datos para revisar.'])
})

test('the real Carrefour case shows each sentence once', () => {
  const labels = resolveOcrIssueLabels(
    [
      'amount_unreadable',
      'merchant_missing',
      'ocr.issue_category_pending',
      'ocr.issue_payment_pending',
    ],
    fakeTranslate,
  )

  assert.deepEqual(labels, [
    'El sistema marcó datos para revisar.',
    'Hay productos sin categoría.',
    'Falta la forma de pago.',
  ])

  // The exact symptom: no sentence appears twice.
  assert.equal(new Set(labels).size, labels.length)
})

test('codes with a dedicated label stay distinct and keep their order', () => {
  const labels = resolveOcrIssueLabels(
    ['ocr.issue_payment_pending', 'ocr.issue_category_pending'],
    fakeTranslate,
  )

  assert.deepEqual(labels, [
    'Falta la forma de pago.',
    'Hay productos sin categoría.',
  ])
})

test('an empty list stays empty', () => {
  assert.deepEqual(resolveOcrIssueLabels([], fakeTranslate), [])
})
