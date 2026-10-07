// tests/import_validate.test.js
// Pure validation/matching checks for the Importar/Exportar wizard (no DB, no
// DOM). Node 24 native TypeScript type stripping lets us import the .ts module
// directly, same pattern as tests/import_parser.test.js and voice_codec.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ROW_ERROR_KEYS,
  buildWorkset,
  buildRow,
  collectEntities,
  accountKey,
  matchEntities,
  countStatuses,
  canExecute,
  suggestCupo,
} from '../src/lib/importExport/validate.ts'

const PREFS = { separador_miles: '.', separador_decimal: ',', formato_fecha: 'DD/MM/YYYY' }
const HEADERS = ['Fecha', 'Tipo', 'Monto', 'Origen', 'Destino', 'Cuenta', 'Detalle']
const FULL_MAP = {
  fecha: 0,
  tipo: 1,
  monto: 2,
  billetera_origen: 3,
  billetera_destino: 4,
  cuenta: 5,
  detalle: 6,
}
const SIGN_MAP = { fecha: 0, monto: 1, billetera_origen: 2, cuenta: 3 }

function buildOne(row, mapping = FULL_MAP, sep = 'dash', tipoSource = 'column') {
  return buildWorkset({
    headers: HEADERS,
    rows: [row],
    mapping,
    sep,
    tipoSource,
    prefs: PREFS,
  })[0]
}

test('buildWorkset builds the canonical row on the happy path', () => {
  const row = buildOne([
    '15/03/2026',
    'egreso',
    '1.250,50',
    'Efectivo',
    '',
    'Alimentos-Super',
    'Compra semanal',
  ])
  assert.equal(row.fechaISO, '2026-03-15')
  assert.equal(row.tipo, 'expense')
  assert.equal(row.monto, 1250.5)
  assert.deepEqual(row.wallets, { origen: 'efectivo', destino: '' })
  assert.deepEqual(row.cuenta, { padre: 'Alimentos', sub: 'Super' })
  assert.equal(row.detalle, 'Compra semanal')
  assert.deepEqual(row.fieldErrors, [])
})

test('buildRow flags each missing/invalid mandatory field with its own key', () => {
  const row = buildOne(['no-fecha', 'egreso', 'abc', '', '', 'A-B-C', ''])
  assert.deepEqual(row.fieldErrors, [
    ROW_ERROR_KEYS.fecha,
    ROW_ERROR_KEYS.monto,
    ROW_ERROR_KEYS.billetera,
    ROW_ERROR_KEYS.cuenta,
  ])
})

test('buildRow rejects a zero amount', () => {
  const row = buildOne(['15/03/2026', 'egreso', '0', 'Efectivo', '', 'A-B', ''])
  assert.deepEqual(row.fieldErrors, [ROW_ERROR_KEYS.monto])
})

test('buildRow flags an unresolvable tipo when there is no column and no amount base', () => {
  const row = buildOne(['15/03/2026', '', '0', 'Efectivo', '', '', ''])
  assert.deepEqual(row.fieldErrors, [ROW_ERROR_KEYS.monto, ROW_ERROR_KEYS.tipo])
})

test('buildRow resolves a transfer from the tipo column and requires its destino', () => {
  const ok = buildOne([
    '15/03/2026',
    'transferencia',
    '500,00',
    'Efectivo',
    'Banco',
    'Ahorro-Meta',
    '',
  ])
  assert.equal(ok.tipo, 'transfer')
  assert.deepEqual(ok.wallets, { origen: 'efectivo', destino: 'banco' })
  assert.deepEqual(ok.fieldErrors, [])

  const missingDestino = buildOne([
    '15/03/2026',
    'transferencia',
    '500,00',
    'Efectivo',
    '',
    'Ahorro-Meta',
    '',
  ])
  assert.equal(missingDestino.tipo, 'transfer')
  assert.deepEqual(missingDestino.fieldErrors, [ROW_ERROR_KEYS.destino])
})

test('buildRow honors the column tipo source over the amount sign', () => {
  const row = buildOne(['15/03/2026', 'ingreso', '-500,00', 'Efectivo', '', '', ''])
  assert.equal(row.tipo, 'income')
  assert.equal(row.monto, -500)
  assert.deepEqual(row.fieldErrors, [])
})

test('signo mode infers the tipo from the amount sign and skips cuenta for income', () => {
  const income = buildOne(['15/03/2026', '500,00', 'Efectivo', 'A-B-C'], SIGN_MAP, 'dash', 'sign')
  assert.equal(income.tipo, 'income')
  assert.equal(income.cuenta, null)
  assert.deepEqual(income.fieldErrors, [])

  const expense = buildOne(['15/03/2026', '-500,00', 'Efectivo', 'A-B-C'], SIGN_MAP, 'dash', 'sign')
  assert.equal(expense.tipo, 'expense')
  assert.equal(expense.cuenta, null)
  assert.deepEqual(expense.fieldErrors, [ROW_ERROR_KEYS.cuenta])
})

test('collectEntities dedups wallets and keeps distinct account pairs', () => {
  const rows = buildWorkset({
    headers: HEADERS,
    rows: [
      ['15/03/2026', 'egreso', '100', 'Efectivo', '', 'Alimentos-Super', ''],
      ['15/03/2026', 'transferencia', '100', 'Efectivo', 'Banco', 'Ahorro-Meta', ''],
      ['15/03/2026', 'transferencia', '100', 'Banco', 'Efectivo', 'Ahorro-Meta', ''],
    ],
    mapping: FULL_MAP,
    sep: 'dash',
    tipoSource: 'column',
    prefs: PREFS,
  })
  const entities = collectEntities(rows)
  assert.deepEqual(entities.wallets, ['efectivo', 'banco'])
  // Only expense rows carry an account: schema marks cuenta optional for
  // income and transfer, matching fn_registrar_movimiento_caja usage.
  assert.deepEqual(entities.accounts, [
    { padre: 'Alimentos', sub: 'Super' },
  ])
  // The cuenta values on transfer rows were ignored, not surfaced as errors.
  assert.equal(rows[1].fieldErrors.length, 0)
  assert.equal(rows[2].fieldErrors.length, 0)
})

test('accountKey normalizes the parent and treats a missing sub as empty', () => {
  assert.equal(accountKey({ padre: 'Alimentos', sub: 'Super' }), 'alimentos|super')
  assert.equal(accountKey({ padre: 'Transporte', sub: null }), 'transporte|')
})

test('matchEntities matches raw first, then normalized, and flags collisions', () => {
  const existing = ['Efectivo', 'Banco', 'Alimentos']

  assert.deepEqual(matchEntities(['Efectivo'], existing).Efectivo, {
    exact: 'Efectivo',
    normalized: 'Efectivo',
    ambiguity: false,
  })

  assert.deepEqual(matchEntities(['efectivo'], existing).efectivo, {
    exact: null,
    normalized: 'Efectivo',
    ambiguity: false,
  })

  assert.deepEqual(matchEntities(['Nueva'], existing).Nueva, {
    exact: null,
    normalized: null,
    ambiguity: false,
  })

  assert.deepEqual(matchEntities(['BANCO'], ['Banco', 'banco']).BANCO, {
    exact: null,
    normalized: null,
    ambiguity: true,
  })
})

test('countStatuses and canExecute summarize the workset', () => {
  const clean = buildWorkset({
    headers: HEADERS,
    rows: [
      ['15/03/2026', 'egreso', '100', 'Efectivo', '', 'Alimentos-Super', ''],
      ['15/03/2026', 'egreso', '100', 'Banco', '', 'Alimentos-Super', ''],
    ],
    mapping: FULL_MAP,
    sep: 'dash',
    tipoSource: 'column',
    prefs: PREFS,
  })
  assert.deepEqual(countStatuses(clean), { ok: 2, error: 0, clean: true })
  assert.equal(canExecute(clean), true)

  const dirty = [...clean, buildOne(['bad', 'egreso', '100', 'Efectivo', '', 'A-B', ''])]
  assert.deepEqual(countStatuses(dirty), { ok: 2, error: 1, clean: false })
  assert.equal(canExecute(dirty), false)
})

test('suggestCupo maps name hints to a budget class and defaults to need', () => {
  assert.equal(suggestCupo('Impuestos'), 'need')
  assert.equal(suggestCupo('Luz y agua'), 'need')
  assert.equal(suggestCupo('Ocio'), 'want')
  assert.equal(suggestCupo('Restaurantes'), 'want')
  assert.equal(suggestCupo('Suscripciones'), 'want')
  assert.equal(suggestCupo('Iglesia'), 'tithe')
  assert.equal(suggestCupo('Donaciones'), 'tithe')
  assert.equal(suggestCupo('Sin clasificar'), 'need')
})

test('buildWorkset is defensive with an empty row list', () => {
  assert.deepEqual(
    buildWorkset({
      headers: HEADERS,
      rows: [],
      mapping: FULL_MAP,
      sep: 'dash',
      tipoSource: 'column',
      prefs: PREFS,
    }),
    []
  )
})

test('buildRow works on a single raw row for the inline edit flow', () => {
  const row = buildRow(
    ['15/03/2026', 'egreso', '100', 'Efectivo', '', 'Alimentos-Super', ''],
    FULL_MAP,
    'dash',
    'column',
    PREFS
  )
  assert.deepEqual(row.fieldErrors, [])
})
