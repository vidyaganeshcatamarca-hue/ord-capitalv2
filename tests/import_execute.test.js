// tests/import_execute.test.js
// Pure checks for the import execution layer (T4): RFC4180 CSV serialization,
// the registrar param mapping and the error/duration helpers — plus the pure
// export helpers (T5: prefs number/date formatting, canonical rows, xlsx AoA +
// numFmt, CSV text, filename, range bounds, base64, native detection).
// No DB, no DOM, no Capacitor: the impure downloadExport is never called.
// Node 24 native TypeScript type stripping lets us import the .ts modules
// directly, same pattern as tests/import_parser.test.js / import_validate.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { rowsToCsv } from '../src/lib/importExport/csv.ts'
import {
  durationBucket,
  errorKeyOf,
  partitionExcludedRows,
  planAccountCreation,
  rowToMovementParams,
} from '../src/lib/importExport/execute.ts'
import {
  buildCanonicalRows,
  buildCsvText,
  buildXlsxAoA,
  bytesToBase64,
  exportFileName,
  formatDate,
  formatNumber,
  isNativeApp,
  resolveRangeBounds,
} from '../src/lib/importExport/exportFile.ts'
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

test('rowToMovementParams sends p_destination_amount: null for every transfer (import has no cross-currency)', () => {
  const row = rowOf([
    '15/03/2026',
    'transferencia',
    '500,00',
    'Efectivo',
    'Banco',
    'Ahorro-Meta',
    '',
  ])

  // The transfer itself maps normally...
  const transfer = rowToMovementParams(row, { origenWalletId: 1, destinoWalletId: 2 })
  assert.equal(transfer.p_tipo, 'transfer')
  assert.equal(transfer.p_billetera_destino_id, 2)
  assert.equal(transfer.p_estructura_egreso_id, null)
  assert.equal(transfer.p_valor_egreso, 500)
  assert.equal(transfer.p_valor_ingreso, 0)

  // ...and never carries a destination amount. The import path dropped
  // monto_destino (spec §5 amendment), so a currency mismatch between the two
  // wallets is not detectable here: the row reaches fn_registrar_movimiento_caja
  // and fails there with the backend's error contract (surfaced per row).
  assert.equal(transfer.p_destination_amount, null)

  const income = rowToMovementParams(
    rowOf(['15/03/2026', 'ingreso', '500,00', 'Efectivo', '', '', '']),
    { origenWalletId: 1 }
  )
  assert.equal(income.p_destination_amount, null)
})

test('rowToMovementParams keeps p_destination_amount in the payload (backend contract)', () => {
  const row = rowOf(['15/03/2026', 'egreso', '10,00', 'Efectivo', '', 'Alimentos', ''])
  const params = rowToMovementParams(row, { origenWalletId: 1, estructuraEgresoId: 2 })
  assert.ok(Object.prototype.hasOwnProperty.call(params, 'p_destination_amount'))
  assert.equal(params.p_destination_amount, null)
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

// ── planAccountCreation (account target resolution, defect 2) ───────────────

function accountTarget(overrides = {}) {
  return {
    key: 'vivienda|luz',
    existingId: null,
    existingParentId: null,
    finalName: 'Vivienda',
    sub: 'Luz',
    subName: 'Luz',
    cupo: 'need',
    ...overrides,
  }
}

test('planAccountCreation reuses the matched leaf and creates nothing', () => {
  assert.deepEqual(planAccountCreation(accountTarget({ existingId: 42 })), {
    action: 'reuse-leaf',
    leafId: 42,
  })
})

test('planAccountCreation reuses an existing parent for a sub-only target (no parent re-creation)', () => {
  const plan = planAccountCreation(accountTarget({ existingParentId: 7 }))
  assert.deepEqual(plan, { action: 'reuse-parent', parentId: 7, subName: 'Luz' })
  // There is no create-parent branch, so executeImport never calls
  // fn_crear_cuenta_egreso for this target: the parent is NOT duplicated.
  assert.notEqual(plan.action, 'create-parent')
})

test('planAccountCreation creates the parent (deduped by normalized name) only when both ids are absent', () => {
  const plan = planAccountCreation(
    accountTarget({ finalName: '  Vivienda ', sub: 'Luz', subName: 'Luz', cupo: 'want' })
  )
  assert.deepEqual(plan, {
    action: 'create-parent',
    parentKey: 'vivienda',
    parentName: '  Vivienda ',
    cupo: 'want',
    subName: 'Luz',
  })
})

test('planAccountCreation treats a parent-only target as a sub-less parent', () => {
  const existing = planAccountCreation(accountTarget({ sub: null, existingParentId: 7 }))
  assert.deepEqual(existing, { action: 'reuse-parent', parentId: 7, subName: null })

  const brandNew = planAccountCreation(accountTarget({ sub: null, subName: '' }))
  assert.equal(brandNew.action, 'create-parent')
  assert.equal(brandNew.subName, null)
})

test('planAccountCreation ignores non-finite existing ids', () => {
  assert.equal(
    planAccountCreation(accountTarget({ existingId: Number.NaN })).action,
    'create-parent'
  )
  assert.equal(
    planAccountCreation(accountTarget({ existingId: Number.NaN, existingParentId: Number.NaN }))
      .action,
    'create-parent'
  )
})

test('two new subs under the same new parent share one parentKey (created once)', () => {
  const a = planAccountCreation(accountTarget({ key: 'vivienda|luz', sub: 'Luz', subName: 'Luz' }))
  const b = planAccountCreation(accountTarget({ key: 'vivienda|agua', sub: 'Agua', subName: 'Agua' }))
  assert.equal(a.action, 'create-parent')
  assert.equal(b.action, 'create-parent')

  // Mirror executeImport's createdParentIds dedupe: equal parentKey -> one call.
  const created = new Set()
  let parentsCreated = 0
  for (const plan of [a, b]) {
    if (plan.action === 'create-parent' && !created.has(plan.parentKey)) {
      created.add(plan.parentKey)
      parentsCreated++
    }
  }
  assert.equal(a.parentKey, b.parentKey)
  assert.equal(parentsCreated, 1)
})

// ── partitionExcludedRows (rejected accounts, owner defect 2) ───────────────

test('partitionExcludedRows drops rejected-account rows and counts them', () => {
  const expense = {
    index: 0,
    data: rowOf(['15/03/2026', 'egreso', '100', 'Efectivo', '', 'Alimentos-Super', '']),
  }
  const income = {
    index: 1,
    data: rowOf(['15/03/2026', 'ingreso', '500,00', 'Efectivo', '', '', 'Sueldo']),
  }
  const transfer = {
    index: 2,
    data: rowOf(['15/03/2026', 'transferencia', '500,00', 'Efectivo', 'Banco', 'Ahorro-Meta', '']),
  }

  const result = partitionExcludedRows([expense, income, transfer], ['alimentos|super'])
  assert.equal(result.excludedCount, 1)
  assert.deepEqual(
    result.rows.map((row) => row.index),
    [1, 2]
  )

  // No rejections: everything survives and the count is 0.
  const passthrough = partitionExcludedRows([expense, income], [])
  assert.equal(passthrough.excludedCount, 0)
  assert.equal(passthrough.rows.length, 2)

  // Defensive: a missing list is treated as empty.
  assert.deepEqual(partitionExcludedRows(undefined, []), { rows: [], excludedCount: 0 })
})

test('partitionExcludedRows keys exactly on the normalized accountKey the caller passes', () => {
  const expense = {
    index: 0,
    data: rowOf(['15/03/2026', 'egreso', '100', 'Efectivo', '', 'Alimentos-Super', '']),
  }
  // accountKey() output is the contract for rejectedKeys (already normalized).
  assert.equal(partitionExcludedRows([expense], ['alimentos|super']).excludedCount, 1)
  // A different key leaves the row in the importable batch.
  const other = partitionExcludedRows([expense], ['otra|sub'])
  assert.equal(other.excludedCount, 0)
  assert.deepEqual(other.rows.map((row) => row.index), [0])
})

// ── exportFile.ts — pure helpers (T5) ────────────────────────────────────────

const EXPORT_PREFS = {
  separador_miles: '.',
  separador_decimal: ',',
  decimales: 2,
  formato_fecha: 'DD/MM/YYYY',
}
const EXPORT_HEADERS = [
  'Fecha',
  'Tipo',
  'Monto',
  'Billetera de origen',
  'Billetera de destino',
  'Cuenta',
  'Detalle',
]

/** Wire shape of fn_exportar_movimientos: Postgres numeric arrives as string. */
function rpcRow(overrides = {}) {
  return {
    fecha: '2026-03-15',
    tipo: 'expense',
    monto: '1250.50',
    bill_origen: 'Efectivo',
    bill_destino: null,
    cuenta: 'Alimentos-Super',
    detalle: 'Compra semanal',
    ...overrides,
  }
}

test('formatNumber applies the user separators and decimals', () => {
  assert.equal(formatNumber(1250.5, EXPORT_PREFS), '1.250,50')
  assert.equal(formatNumber(-1250.5, EXPORT_PREFS), '-1.250,50')
  assert.equal(formatNumber(1250, { ...EXPORT_PREFS, decimales: 0 }), '1.250')
  assert.equal(
    formatNumber(1234567.891, { separador_miles: ' ', separador_decimal: ',', decimales: 2 }),
    '1 234 567,89'
  )
  assert.equal(
    formatNumber(1234.5, { separador_miles: ',', separador_decimal: '.', decimales: 1 }),
    '1,234.5'
  )
  // Defensive: a bad pref never breaks toFixed().
  assert.equal(formatNumber(12, { ...EXPORT_PREFS, decimales: 9 }), '12,00')
  assert.equal(formatNumber(12, { ...EXPORT_PREFS, decimales: -1 }), '12')
  assert.equal(formatNumber(Number.NaN, EXPORT_PREFS), '0,00')
})

test('formatDate renders the prefs formato_fecha and falls back to ISO', () => {
  assert.equal(formatDate('2026-03-15', 'DD/MM/YYYY'), '15/03/2026')
  assert.equal(formatDate('2026-03-15', 'YYYY-MM-DD'), '2026-03-15')
  assert.equal(formatDate('2026-03-15', 'D/M/YY'), '15/3/26')
  // Unknown format / non-ISO input: never fabricate a date.
  assert.equal(formatDate('2026-03-15', 'sin-formato'), '2026-03-15')
  assert.equal(formatDate('2026-03-15', ''), '2026-03-15')
  assert.equal(formatDate('15/03/2026', 'DD/MM/YYYY'), '15/03/2026')
  assert.equal(formatDate(null, 'DD/MM/YYYY'), '')
})

test('buildCanonicalRows Number()-wraps the wire monto and keeps transfer rows normal', () => {
  const rows = buildCanonicalRows(
    [
      rpcRow(),
      rpcRow({
        tipo: 'transfer',
        monto: '500',
        bill_origen: 'Efectivo',
        bill_destino: 'Banco',
        cuenta: null,
        detalle: 'Ahorro',
      }),
    ],
    EXPORT_PREFS
  )

  assert.equal(rows.length, 2)
  assert.equal(rows[0].monto, 1250.5)
  assert.equal(rows[0].montoDisplay, '1.250,50')
  assert.equal(rows[0].fechaStr, '15/03/2026')
  assert.equal(rows[0].origen, 'Efectivo')
  assert.equal(rows[0].cuenta, 'Alimentos-Super')

  // Cross-currency legs arrive pre-paired as ONE tipo='transfer' row
  // (bill_destino = leg-B wallet, cuenta NULL, detalle = nota): normal row.
  assert.equal(rows[1].tipo, 'transfer')
  assert.equal(rows[1].destino, 'Banco')
  assert.equal(rows[1].cuenta, '')
  assert.equal(rows[1].detalle, 'Ahorro')
  assert.equal(rows[1].montoDisplay, '500,00')

  assert.deepEqual(buildCanonicalRows(undefined, EXPORT_PREFS), [])
})

test('buildXlsxAoA emits real numeric monto cells with a prefs-derived numFmt', () => {
  const rows = buildCanonicalRows([rpcRow()], EXPORT_PREFS)
  const spec = buildXlsxAoA(rows, EXPORT_HEADERS, EXPORT_PREFS)

  assert.equal(spec.aoa.length, 2)
  assert.deepEqual(spec.aoa[0], EXPORT_HEADERS)
  assert.equal(spec.montoColumnIndex, 2)
  assert.equal(spec.aoa[1][2], 1250.5)
  assert.equal(typeof spec.aoa[1][2], 'number')
  assert.equal(spec.aoa[1][0], '15/03/2026')
  assert.equal(spec.aoa[1][4], '')

  assert.equal(spec.montoNumFmt, '#,##0.00')
  assert.equal(buildXlsxAoA([], EXPORT_HEADERS, { ...EXPORT_PREFS, decimales: 0 }).montoNumFmt, '#,##0')
  assert.equal(buildXlsxAoA([], EXPORT_HEADERS, { ...EXPORT_PREFS, decimales: 1 }).montoNumFmt, '#,##0.0')
})

test('buildCsvText uses ";" and carries the prefs-formatted monto as text', () => {
  const rows = buildCanonicalRows([rpcRow()], EXPORT_PREFS)
  const csv = buildCsvText(rows, EXPORT_HEADERS)
  const lines = csv.split('\r\n')

  assert.equal(lines.length, 2)
  assert.equal(lines[0], EXPORT_HEADERS.join(';'))
  assert.equal(lines[1], '15/03/2026;expense;1.250,50;Efectivo;;Alimentos-Super;Compra semanal')
  // A ',' delimiter would collide with the ',' decimal separator.
  assert.ok(lines[1].includes('1.250,50'))
})

test('exportFileName slugs the range and picks the right extension', () => {
  assert.equal(
    exportFileName('2026-03-01', '2026-03-31', 'xlsx'),
    'ordcapital_movimientos_2026-03-01_2026-03-31.xlsx'
  )
  assert.equal(exportFileName('2026-03-01', '2026-03-31', 'csv'), 'ordcapital_movimientos_2026-03-01_2026-03-31.csv')
  assert.equal(exportFileName('', '', 'csv'), 'ordcapital_movimientos_all.csv')
})

test('resolveRangeBounds returns local month bounds and gates an incomplete custom range', () => {
  const now = new Date(2026, 2, 15) // 2026-03-15 local
  assert.deepEqual(resolveRangeBounds('current', '', '', now), {
    from: '2026-03-01',
    to: '2026-03-31',
  })
  assert.deepEqual(resolveRangeBounds('previous', '', '', now), {
    from: '2026-02-01',
    to: '2026-02-28',
  })
  // January -> previous month is December of the previous year.
  assert.deepEqual(resolveRangeBounds('previous', '', '', new Date(2026, 0, 10)), {
    from: '2025-12-01',
    to: '2025-12-31',
  })
  assert.equal(resolveRangeBounds('custom', '', '', now), null)
  assert.equal(resolveRangeBounds('custom', '2026-03-01', '', now), null)
  assert.deepEqual(resolveRangeBounds('custom', '2026-03-01', '2026-03-31', now), {
    from: '2026-03-01',
    to: '2026-03-31',
  })
  // Reversed custom range is normalized, never sent inverted.
  assert.deepEqual(resolveRangeBounds('custom', '2026-03-31', '2026-03-01', now), {
    from: '2026-03-01',
    to: '2026-03-31',
  })
})

test('bytesToBase64 encodes the Capacitor payload with correct padding', () => {
  assert.equal(bytesToBase64(new Uint8Array([0x66, 0x6f, 0x6f])), 'Zm9v')
  assert.equal(bytesToBase64(new Uint8Array([0x66, 0x6f])), 'Zm8=')
  assert.equal(bytesToBase64(new Uint8Array([0x66])), 'Zg==')
  assert.equal(bytesToBase64(new Uint8Array([0x00, 0x01, 0x02])), 'AAEC')
  assert.equal(bytesToBase64(new Uint8Array([])), '')
})

test('isNativeApp detects the Capacitor shell and never throws without a window', () => {
  assert.equal(isNativeApp(null), false)
  assert.equal(isNativeApp({}), false)
  assert.equal(isNativeApp({ Capacitor: {} }), false)
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => true } }), true)
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => false } }), false)
  assert.equal(
    isNativeApp({
      Capacitor: {
        isNativePlatform: () => {
          throw new Error('boom')
        },
      },
    }),
    false
  )
})
