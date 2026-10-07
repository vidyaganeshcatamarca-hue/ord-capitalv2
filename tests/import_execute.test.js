// tests/import_execute.test.js
// Pure checks for the import execution layer (T4): RFC4180 CSV serialization,
// the registrar param mapping and the error/duration helpers. No DB, no DOM.
// Node 24 native TypeScript type stripping lets us import the .ts modules
// directly, same pattern as tests/import_parser.test.js / import_validate.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { rowsToCsv } from '../src/lib/importExport/csv.ts'
import {
  durationBucket,
  errorKeyOf,
  rowToMovementParams,
} from '../src/lib/importExport/execute.ts'
import { buildWorkset } from '../src/lib/importExport/validate.ts'

const PREFS = { separador_miles: '.', separador_decimal: ',', formato_fecha: 'DD/MM/YYYY' }
const HEADERS = ['Fecha', 'Tipo', 'Monto', 'Origen', 'Destino', 'Cuenta', 'Detalle']
const MAP = {
  fecha: 0,
  tipo: 1,
  monto: 2,
  billetera_origen: 3,
  billetera_destino: 4,
  cuenta: 5,
  detalle: 6,
}

function rowOf(cells) {
  return buildWorkset({
    headers: HEADERS,
    rows: [cells],
    mapping: MAP,
    sep: 'dash',
    tipoSource: 'column',
    prefs: PREFS,
  })[0]
}

// ── csv.ts ────────────────────────────────────────────────────────────────

test('rowsToCsv quotes delimiter, quote and line-break fields (RFC4180)', () => {
  const csv = rowsToCsv([
    ['a;b', 'plain', '"q"', 'line\nbreak'],
  ])
  assert.equal(csv, '"a;b";plain;"""q""";"line\nbreak"')
})

test('rowsToCsv joins records with CRLF and has no trailing line break', () => {
  assert.equal(rowsToCsv([['a', 'b'], ['c', 'd']]), 'a;b\r\nc;d')
})

test('rowsToCsv honors a custom delimiter and quotes it', () => {
  assert.equal(rowsToCsv([['a', 'b;c']], { delimiter: ',' }), 'a,b;c')
  assert.equal(rowsToCsv([['a', 'b,c']], { delimiter: ',' }), 'a,"b,c"')
  assert.equal(rowsToCsv([['a', 'b\tc']], { delimiter: '\t' }), 'a\t"b\tc"')
})

test('rowsToCsv serializes an empty matrix to an empty string', () => {
  assert.equal(rowsToCsv([]), '')
  assert.equal(rowsToCsv([], { delimiter: ',' }), '')
})

// ── rowToMovementParams ───────────────────────────────────────────────────

test('rowToMovementParams maps an expense to estructura + valor_egreso', () => {
  const row = rowOf([
    '15/03/2026',
    'egreso',
    '1.250,50',
    'Efectivo',
    '',
    'Alimentos-Super',
    'Compra semanal',
  ])
  const params = rowToMovementParams(row, { origenWalletId: 7, estructuraEgresoId: 42 })

  assert.equal(params.p_tipo, 'expense')
  assert.equal(params.p_billetera_origen_id, 7)
  assert.equal(params.p_billetera_destino_id, null)
  assert.equal(params.p_valor_ingreso, 0)
  assert.equal(params.p_valor_egreso, 1250.5)
  assert.equal(params.p_estructura_egreso_id, 42)
  assert.equal(params.p_fecha, '2026-03-15')
  assert.equal(params.p_es_compartido, false)
  assert.equal(params.p_proyecto_id, null)
  assert.equal(params.p_cuenta_ingreso_id, null)
  assert.equal(params.p_destination_amount, null)
  assert.equal(params.p_detalle, 'Compra semanal')
})

test('rowToMovementParams maps an income to valor_ingreso with no estructura', () => {
  const row = rowOf(['15/03/2026', 'ingreso', '500,00', 'Efectivo', '', '', 'Sueldo'])
  const params = rowToMovementParams(row, { origenWalletId: 3, estructuraEgresoId: 5 })

  assert.equal(params.p_tipo, 'income')
  assert.equal(params.p_valor_ingreso, 500)
  assert.equal(params.p_valor_egreso, 0)
  assert.equal(params.p_billetera_destino_id, null)
  assert.equal(params.p_estructura_egreso_id, null)
})

test('rowToMovementParams sends the destination amount only for cross-currency transfers', () => {
  const row = rowOf([
    '15/03/2026',
    'transferencia',
    '500,00',
    'Efectivo',
    'Banco',
    'Ahorro-Meta',
    '',
  ])

  const cross = rowToMovementParams(row, {
    origenWalletId: 1,
    destinoWalletId: 2,
    origenCurrency: 'ARS',
    destinoCurrency: 'USD',
    destinationAmount: 0.5,
  })
  assert.equal(cross.p_billetera_destino_id, 2)
  assert.equal(cross.p_estructura_egreso_id, null)
  assert.equal(cross.p_valor_egreso, 500)
  assert.equal(cross.p_destination_amount, 0.5)

  const sameCurrency = rowToMovementParams(row, {
    origenWalletId: 1,
    destinoWalletId: 2,
    origenCurrency: 'ARS',
    destinoCurrency: 'ARS',
    destinationAmount: 0.5,
  })
  assert.equal(sameCurrency.p_destination_amount, null)

  const crossWithoutAmount = rowToMovementParams(row, {
    origenWalletId: 1,
    destinoWalletId: 2,
    origenCurrency: 'ars',
    destinoCurrency: 'usd',
    destinationAmount: null,
  })
  assert.equal(crossWithoutAmount.p_destination_amount, null)
})

test('rowToMovementParams maps an empty detalle to null', () => {
  const row = rowOf(['15/03/2026', 'ingreso', '500,00', 'Efectivo', '', '', ''])
  const params = rowToMovementParams(row, { origenWalletId: 3 })
  assert.equal(params.p_detalle, null)
})

// ── errorKeyOf / durationBucket ───────────────────────────────────────────

test('errorKeyOf extracts the machine key from wrapped RPC messages', () => {
  assert.equal(
    errorKeyOf({ message: '{"key": "error_transfer_insufficient_balance", "params": {}}' }),
    'error_transfer_insufficient_balance'
  )
  assert.equal(
    errorKeyOf('PostgresException: {"key": "error_wallet_not_found", "params": {}}'),
    'error_wallet_not_found'
  )
  assert.equal(errorKeyOf('plain failure'), '')
  assert.equal(errorKeyOf(null), '')
})

test('durationBucket coarsens elapsed milliseconds into the 5 buckets', () => {
  assert.equal(durationBucket(0), '<5')
  assert.equal(durationBucket(4_999), '<5')
  assert.equal(durationBucket(5_000), '<15')
  assert.equal(durationBucket(14_999), '<15')
  assert.equal(durationBucket(15_000), '<60')
  assert.equal(durationBucket(59_999), '<60')
  assert.equal(durationBucket(60_000), '<300')
  assert.equal(durationBucket(299_999), '<300')
  assert.equal(durationBucket(300_000), '300+')
})
