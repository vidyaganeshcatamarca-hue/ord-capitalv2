// tests/swipe-vencimientos.test.js
//
//   node --test tests/swipe-vencimientos.test.js
//
// Dueño (2026-11-02): las dos notificaciones de "próximos vencimientos de tarjeta" no
// tenían acción; al tocarlas debe llevar a pagar la tarjeta, y un barrido lateral debe
// quitarlas de la ventana de notificaciones.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { isDismissSwipe, SWIPE_DISMISS_PX } from '../src/lib/swipeDismiss.ts'

test('un barrido lateral descarta', () => {
  assert.equal(isDismissSwipe(SWIPE_DISMISS_PX + 20, 10), true)
  assert.equal(isDismissSwipe(-(SWIPE_DISMISS_PX + 20), 10), true)
})

test('un toque no descarta', () => {
  assert.equal(isDismissSwipe(8, 4), false)
})

test('scrollear hacia arriba no descarta', () => {
  assert.equal(isDismissSwipe(70, 120), false)
})

test('el Home engancha gesto y accion en los vencimientos', () => {
  const home = fs.readFileSync('src/pages/Home/HomePage.tsx', 'utf8')
  assert.match(home, /isDismissSwipe/, 'las filas de vencimiento no tienen gesto de descarte')
  assert.match(home, /onTouchStart/, 'no hay inicio de gesto')
  assert.match(home, /onTouchEnd/, 'no hay fin de gesto')
  assert.match(home, /alert-vencimiento-card[^>]*onClick|onClick=[^>]*alert-vencimiento-card/, 'las filas de vencimiento no navegan')
})
