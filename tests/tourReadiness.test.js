// tests/tourReadiness.test.js
// Owner tanda 6, bug 2: the guided tour of Inicio started at its LAST step
// ("Cargar datos", over the FAB) instead of the hero card.
//
// Root cause: the tour is launched from Ayuda behind a fixed 350 ms delay while
// the step builder silently skips every target missing from the DOM. The FAB
// lives in the bottom navigation, so it was the only target that resolved — a
// one-step tour that renders "Entendido".
//
// The rule now: never build the tour before its FIRST target exists; wait a
// bounded time, then launch with whatever rendered.
//
//   node --test tests/tourReadiness.test.js

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TOUR_READY_POLL_MS,
  TOUR_READY_TIMEOUT_MS,
  tourReadiness,
} from '../src/tours/core/tourReadiness.ts'

test('the tour starts as soon as its first target exists', () => {
  assert.equal(tourReadiness(true, 0, TOUR_READY_TIMEOUT_MS), 'ready')
  assert.equal(tourReadiness(true, TOUR_READY_TIMEOUT_MS - 1, TOUR_READY_TIMEOUT_MS), 'ready')
})

test('while the first target is missing the launch waits', () => {
  assert.equal(tourReadiness(false, 0, TOUR_READY_TIMEOUT_MS), 'wait')
  assert.equal(tourReadiness(false, 350, TOUR_READY_TIMEOUT_MS), 'wait')
})

test('the wait is bounded: past the timeout the tour launches anyway', () => {
  assert.equal(tourReadiness(false, TOUR_READY_TIMEOUT_MS, TOUR_READY_TIMEOUT_MS), 'give-up')
  assert.equal(tourReadiness(false, TOUR_READY_TIMEOUT_MS + 500, TOUR_READY_TIMEOUT_MS), 'give-up')
  assert.equal(tourReadiness(false, NaN, TOUR_READY_TIMEOUT_MS), 'wait')
})

test('the poll interval is short enough to feel immediate', () => {
  assert.ok(TOUR_READY_POLL_MS > 0 && TOUR_READY_POLL_MS <= 250, 'poll frequently')
  assert.ok(TOUR_READY_TIMEOUT_MS >= 1000, 'but give slow screens a real chance')
})

test('the launcher waits for the first target instead of a fixed delay', () => {
  const hook = fs.readFileSync(new URL('../src/hooks/useTour.ts', import.meta.url), 'utf-8')
  assert.match(hook, /tourReadiness/, 'the hook uses the shared readiness rule')
  assert.match(hook, /TOUR_READY_POLL_MS/, 'and polls')
  const firstTargetLine = /const firstTarget =/.exec(hook)
  assert.ok(firstTargetLine, 'the first target of the screen drives the wait')

  const help = fs.readFileSync(new URL('../src/components/Tour/HelpIndexPage.tsx', import.meta.url), 'utf-8')
  assert.ok(!/setTimeout\([\s\S]{0,80}startTour/.test(help), 'no fixed delay before starting a tour')
})
