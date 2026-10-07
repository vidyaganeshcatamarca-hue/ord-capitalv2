// tests/import_parser.test.js
// Pure parser checks for the Importar/Exportar wizard (no DB, no DOM).
// Node 24 native TypeScript type stripping lets us import the .ts module
// directly, same pattern as tests/voice_codec.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  detectDelimiter,
  parseDelimitedText,
  normalizeNombre,
  parseMonto,
  parseFecha,
  inferTipo,
  splitCuenta,
  guessHeaderMapping,
} from '../src/lib/importExport/parser.ts'

test('detectDelimiter picks the delimiter with more occurrences outside quotes', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';')
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',')
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t')
})

test('detectDelimiter ignores commas inside quoted fields (mixed winner)', () => {
  const text = 'nombre;monto\n"Perez, Juan";1.250,75'
  assert.equal(detectDelimiter(text), ';')
})

test('detectDelimiter defaults to ; for a single-column file', () => {
  assert.equal(detectDelimiter('soloUnaColumna\nvalor'), ';')
})

test('parseDelimitedText handles quoted fields with delimiters and embedded newlines', () => {
  const text = 'a,b,c\n"x,y","line1\nline2",z\n1,2'
  const { headers, rows } = parseDelimitedText(text)
  assert.deepEqual(headers, ['a', 'b', 'c'])
  assert.deepEqual(rows, [
    ['x,y', 'line1\nline2', 'z'],
    ['1', '2', ''],
  ])
})

test('parseDelimitedText unescapes doubled quotes', () => {
  const { rows } = parseDelimitedText('a,b\n"he said ""hi""",2')
  assert.deepEqual(rows, [['he said "hi"', '2']])
})

test('parseDelimitedText accepts CRLF and skips fully-empty lines', () => {
  const text = 'a,b\r\n\r\n1,2\r\n'
  const { headers, rows } = parseDelimitedText(text)
  assert.deepEqual(headers, ['a', 'b'])
  assert.deepEqual(rows, [['1', '2']])
})

test('parseDelimitedText parses TSV with the detected tab delimiter', () => {
  const { headers, rows } = parseDelimitedText('a\tb\n1\t2')
  assert.deepEqual(headers, ['a', 'b'])
  assert.deepEqual(rows, [['1', '2']])
})

test('normalizeNombre trims, collapses, lowercases and strips diacritics', () => {
  assert.equal(normalizeNombre('  Débito   Frecuente '), 'debito frecuente')
  assert.equal(normalizeNombre(null), '')
})

test('parseMonto reads es-AR amounts using the user prefs', () => {
  assert.deepEqual(parseMonto('1.250.000,75', { separador_miles: '.', separador_decimal: ',' }), {
    valor: 1250000.75,
    inverted: false,
  })
})

test('parseMonto detects the inverted convention only as a fallback', () => {
  assert.deepEqual(parseMonto('1,250,000.75', { separador_miles: '.', separador_decimal: ',' }), {
    valor: 1250000.75,
    inverted: true,
  })
})

test('parseMonto handles plain integers and rejects junk', () => {
  assert.deepEqual(parseMonto('1250', { separador_miles: '.', separador_decimal: ',' }), {
    valor: 1250,
    inverted: false,
  })
  assert.deepEqual(parseMonto('abc', { separador_miles: '.', separador_decimal: ',' }), {
    valor: null,
    inverted: false,
  })
})

test('parseFecha respects the user formato_fecha first', () => {
  assert.equal(parseFecha('03/04/2026', { formato_fecha: 'DD/MM/YYYY' }), '2026-04-03')
})

test('parseFecha reads ISO dates directly', () => {
  assert.equal(parseFecha('2026-04-03', { formato_fecha: 'DD/MM/YYYY' }), '2026-04-03')
})

test('parseFecha resolves dd/mm ambiguity by the day>12 heuristic without prefs', () => {
  assert.equal(parseFecha('03/04/2026'), null)
  assert.equal(parseFecha('13/04/2026'), '2026-04-13')
})

test('parseFecha rejects impossible dates', () => {
  assert.equal(parseFecha('2026-13-01', { formato_fecha: 'DD/MM/YYYY' }), null)
})

test('inferTipo maps explicit words, accent- and case-insensitively', () => {
  assert.equal(inferTipo({ tipoRaw: 'Ingreso' }), 'income')
  assert.equal(inferTipo({ tipoRaw: 'INGRESO' }), 'income')
  assert.equal(inferTipo({ tipoRaw: 'income' }), 'income')
  assert.equal(inferTipo({ tipoRaw: 'Débito' }), 'expense')
  assert.equal(inferTipo({ tipoRaw: 'EGRESO' }), 'expense')
  assert.equal(inferTipo({ tipoRaw: 'gasto' }), 'expense')
})

test('inferTipo falls back to the amount sign', () => {
  assert.equal(inferTipo({ valor: -500 }), 'expense')
  assert.equal(inferTipo({ valor: 500 }), 'income')
})

test('inferTipo returns null when there is no base', () => {
  assert.equal(inferTipo({}), null)
  assert.equal(inferTipo({ tipoRaw: '', valor: null }), null)
})

test('splitCuenta splits by the chosen separator only', () => {
  assert.deepEqual(splitCuenta('Alimentos-Hogar', 'dash'), { padre: 'Alimentos', sub: 'Hogar' })
  assert.deepEqual(splitCuenta('Alimentos-Hogar', 'slash'), { padre: 'Alimentos-Hogar', sub: '' })
})

test('splitCuenta errors on more than two levels or an empty parent', () => {
  assert.deepEqual(splitCuenta('A-B-C', 'dash'), { error: true })
  assert.deepEqual(splitCuenta('-Hogar', 'dash'), { error: true })
  assert.deepEqual(splitCuenta('', 'dash'), { error: true })
})

test('guessHeaderMapping auto-fills every canonical field on a clean header row', () => {
  const headers = ['Fecha', 'Tipo', 'Monto', 'Billetera', 'Destino', 'Cuenta', 'Detalle']
  const { mapping, guessed } = guessHeaderMapping(headers)
  assert.deepEqual(mapping, {
    fecha: 0,
    tipo: 1,
    monto: 2,
    billetera_origen: 3,
    billetera_destino: 4,
    cuenta: 5,
    detalle: 6,
  })
  assert.deepEqual(guessed, [true, true, true, true, true, true, true])
})

test('guessHeaderMapping auto-guesses the exact labels the export emits', () => {
  const { mapping } = guessHeaderMapping([
    'Fecha', 'Tipo', 'Monto', 'Billetera de origen', 'Billetera de destino', 'Cuenta', 'Detalle',
  ])
  assert.deepEqual(mapping, {
    fecha: 0,
    tipo: 1,
    monto: 2,
    billetera_origen: 3,
    billetera_destino: 4,
    cuenta: 5,
    detalle: 6,
  })
})

test('guessHeaderMapping marks ambiguous or unknown headers as not guessed', () => {
  const { mapping, guessed } = guessHeaderMapping(['Monto', 'Importe', 'Rareza'])
  assert.deepEqual(mapping, { monto: 0 })
  assert.deepEqual(guessed, [true, false, false])
})
