// tests/walletDetailRows.test.js
// Owner tanda 4, bug 3: the wallet detail sheet showed the raw movement type
// ('income' / 'expense') and an empty amount ("+-"), because the component read
// fields the RPC never returns.
//
//   node --test tests/walletDetailRows.test.js

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { movementAmount, movementSign, movementIsOutflow, movementTitleSource } from '../src/lib/walletMovementRows.ts'

test('the amount comes from the signed `monto` of the RPC', () => {
  assert.equal(movementAmount({ monto: -20000 }), 20000)
  assert.equal(movementAmount({ monto: 67.09 }), 67.09)
  assert.equal(movementAmount({ monto: '-12.5' }), 12.5)
})

test('missing or broken amounts render as zero, never NaN', () => {
  assert.equal(movementAmount({}), 0)
  assert.equal(movementAmount(null), 0)
  assert.equal(movementAmount({ monto: 'abc' }), 0)
})

test('the sign follows the server-oriented amount', () => {
  assert.equal(movementSign({ monto: -1 }), '-')
  assert.equal(movementSign({ monto: 1 }), '+')
  assert.equal(movementSign({ monto: 0 }), '')
  assert.equal(movementSign({ monto: undefined }), '')
  assert.equal(movementIsOutflow({ monto: -5 }), true)
  assert.equal(movementIsOutflow({ monto: 5 }), false)
})

test('the sheet reads the RPC contract, not the fields that never existed', () => {
  const src = fs
    .readFileSync(
      new URL('../src/components/BilleteraDetailModal/BilleteraDetailModal.tsx', import.meta.url),
      'utf-8',
    )
    // Declarations only: the explanatory comments name the old fields on purpose.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  for (const ghost of ['valor_egreso', 'valor_ingreso', 'nombre_cuenta_historico']) {
    assert.ok(!src.includes(ghost), `the sheet must not read ${ghost}: fn_reporte_movimientos_por_billetera does not return it`)
  }
  assert.match(src, /movementSign|movementAmount/, 'amount and sign come from the pure row helpers')
  assert.match(src, /translateDetalle\(\s*source/, 'the title translates the chosen label (transfer payload included)')
  assert.ok(!/\|\|\s*m\.tipo\b/.test(src), 'the raw tipo is never the visible title')
})

// ── Owner tanda 5, bug 2: the sheet showed "no_category" for cross-currency
// transfers. fn_reporte_movimientos_por_billetera derives nombre_categoria with
// COALESCE(categoria, tipo CASE) and never looks at `detalle`, which IS the real
// label: a JSON transfer payload or 'initial_balance'. The row must prefer that
// specific label over a generic bucket.

test('a generic category yields to the specific detalle label', () => {
  const payload = JSON.stringify({ key: 'transfer_compra_moneda', params: { moneda: 'BRL' } })
  assert.equal(movementTitleSource({ nombre_categoria: 'no_category', detalle: payload }), payload)
  assert.equal(movementTitleSource({ nombre_categoria: 'type_transfer', detalle: payload }), payload)
  assert.equal(movementTitleSource({ nombre_categoria: '', detalle: 'initial_balance' }), 'initial_balance')
})

test('a real category wins over the detalle', () => {
  assert.equal(
    movementTitleSource({ nombre_categoria: 'cat_transport', detalle: 'initial_balance' }),
    'cat_transport',
  )
})

test('a generic bucket with no detalle stays as the safe label', () => {
  assert.equal(movementTitleSource({ nombre_categoria: 'no_category', detalle: null }), 'no_category')
  assert.equal(movementTitleSource({ nombre_categoria: 'cat_food_home', detalle: '' }), 'cat_food_home')
  assert.equal(movementTitleSource({}), '')
})

test('the sheet resolves the chosen label through translateDetalle', () => {
  const src = fs.readFileSync(
    new URL('../src/components/BilleteraDetailModal/BilleteraDetailModal.tsx', import.meta.url),
    'utf-8',
  )
  assert.match(src, /movementTitleSource/, 'the row asks the helper which label to show')
  assert.match(src, /translateDetalle\(/, 'and translates it (never prints the raw key)')
})
