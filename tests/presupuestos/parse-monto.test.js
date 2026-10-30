// tests/presupuestos/parse-monto.test.js
//
//   node --test tests/presupuestos/parse-monto.test.js
//
// Ronda de auditoría, F-01 (crítico). El informe del auditor:
//
//   «Escribir `1500.50` en `input.asignar-monto-input` … Esperado: Asig = 1500,50.
//    Observado: Asig = 150.050.»
//
// Causa: `parseFloat(valor.replace(/\./g, '').replace(',', '.'))` sobre el value de
// un `input[type="number"]`, que siempre trae el punto decimal y nunca separador de
// miles. Borrar los puntos multiplica por 100.
//
// Lo que se congela acá:
//   1. El value de un input numérico ("1500.50") se lee como 1500,5 y no como 150050.
//   2. Las formas que el usuario puede tipear o pegar se leen como espera.
//   3. Sin dígitos no hay número, para que la pantalla pueda decir "monto inválido".

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseMontoInput, parseMontoInputOrZero } from '../../src/lib/parseMonto.ts'

test('el value de un input numerico no se multiplica por 100', () => {
  assert.equal(parseMontoInput('1500.50'), 1500.5)
  assert.equal(parseMontoInput('12.34'), 12.34)
  assert.equal(parseMontoInput('0.99'), 0.99)
  assert.equal(parseMontoInput('150050'), 150050)
  assert.equal(parseMontoInput('1500'), 1500)
})

test('coma decimal, como se tipea en es-AR', () => {
  assert.equal(parseMontoInput('1500,50'), 1500.5)
  assert.equal(parseMontoInput('99,9'), 99.9)
})

test('separador de miles y decimal juntos: manda el ultimo', () => {
  assert.equal(parseMontoInput('1.500,50'), 1500.5)
  assert.equal(parseMontoInput('1,500.50'), 1500.5)
  assert.equal(parseMontoInput('1.500.000,75'), 1500000.75)
  assert.equal(parseMontoInput('1,500,000.75'), 1500000.75)
})

test('separador de miles solo', () => {
  assert.equal(parseMontoInput('1.500.000'), 1500000)
  assert.equal(parseMontoInput('1,500,000'), 1500000)
  assert.equal(parseMontoInput('1,500'), 1500)
})

test('espacios, simbolos de moneda y signo', () => {
  assert.equal(parseMontoInput(' 1500.50 '), 1500.5)
  assert.equal(parseMontoInput('$ 1.500,50'), 1500.5)
  assert.equal(parseMontoInput('1500,50 GBP'), 1500.5)
  assert.equal(parseMontoInput('1 500,50'), 1500.5)
  assert.equal(parseMontoInput('-250,25'), -250.25)
})

test('sin digitos devuelve NaN y el orZero devuelve 0', () => {
  assert.ok(Number.isNaN(parseMontoInput('')))
  assert.ok(Number.isNaN(parseMontoInput('   ')))
  assert.ok(Number.isNaN(parseMontoInput('abc')))
  assert.ok(Number.isNaN(parseMontoInput(null)))
  assert.ok(Number.isNaN(parseMontoInput(undefined)))
  assert.equal(parseMontoInputOrZero(''), 0)
  assert.equal(parseMontoInputOrZero('abc'), 0)
  assert.equal(parseMontoInputOrZero('1500.50'), 1500.5)
})

test('un numero ya numerico pasa tal cual', () => {
  assert.equal(parseMontoInput(1500.5), 1500.5)
  assert.equal(parseMontoInput(0), 0)
  assert.ok(Number.isNaN(parseMontoInput(Number.NaN)))
})

test('nunca devuelve Infinity por un string absurdo', () => {
  for (const entrada of ['1e', '1.2.3.4.5,', ',', '.', '-', '--5']) {
    const n = parseMontoInput(entrada)
    assert.ok(Number.isFinite(n) || Number.isNaN(n), `"${entrada}" dio ${n}`)
  }
})
