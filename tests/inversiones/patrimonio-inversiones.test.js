// tests/inversiones/patrimonio-inversiones.test.js
// Cabecera de patrimonio del módulo Inversiones (S2/S3 de la tanda de puesta a
// punto: "un total en la moneda local + un subtotal por monedas", "monedas nada
// hardcodeado").
//
//   node --test tests/inversiones/patrimonio-inversiones.test.js
//
// Importa el módulo real con type stripping: src/lib/inversionesPatrimonio.ts
// no tiene imports propios (el runner no resuelve alias de Vite).
//
// Reglas fijadas aquí (mismo espíritu que el hero del Home, patrimonioHero.ts):
//   * El número grande es el bucket LOCAL (total_moneda_local del RPC).
//   * Una línea por cada moneda con saldo != 0; la local NO aparece como línea
//     (ya es el número grande). Cero → sin línea. Negativo → SÍ aparece
//     (una pérdida es información).
//   * Una moneda SIN cotización (monedas_sin_cotizacion) también aparece con su
//     total: ocultarla subestimaría lo que el usuario tiene.
//   * Nunca se inventa una moneda que el RPC no devolvió.
//   * Ninguna moneda hardcodeada: nada de ARS ni USD en el cálculo.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPortfolioLines,
  resolveTotalLocal,
} from '../../src/lib/inversionesPatrimonio.ts'

test('la línea local no se repite: es el número grande', () => {
  const lines = buildPortfolioLines('ARS', [
    { moneda: 'ARS', total: 1000 },
    { moneda: 'USD', total: 200 },
  ])
  assert.deepEqual(lines, [{ moneda: 'USD', total: 200 }])
})

test('cada moneda con saldo != 0 genera una línea en el orden del RPC', () => {
  const lines = buildPortfolioLines('ARS', [
    { moneda: 'ARS', total: 1000 },
    { moneda: 'EUR', total: 300 },
    { moneda: 'GBP', total: 50 },
  ])
  assert.deepEqual(lines, [
    { moneda: 'EUR', total: 300 },
    { moneda: 'GBP', total: 50 },
  ])
})

test('una moneda en cero no agrega línea; una negativa sí', () => {
  const lines = buildPortfolioLines('ARS', [
    { moneda: 'EUR', total: 0 },
    { moneda: 'GBP', total: -25 },
  ])
  assert.deepEqual(lines, [{ moneda: 'GBP', total: -25 }])
})

test('la moneda local del usuario no está hardcodeada: si es USD, manda USD', () => {
  const lines = buildPortfolioLines('USD', [
    { moneda: 'USD', total: 1000 },
    { moneda: 'ARS', total: 250 },
  ])
  assert.deepEqual(lines, [{ moneda: 'ARS', total: 250 }])
})

test('una moneda sin cotización aparece igual: ocultarla subestimaría el patrimonio', () => {
  const lines = buildPortfolioLines(
    'ARS',
    [{ moneda: 'ARS', total: 1000 }],
    ['JPY']
  )
  assert.deepEqual(lines, [{ moneda: 'JPY', total: 0 }])
})

test('una moneda sin cotización que sí trae total conserva su monto', () => {
  const lines = buildPortfolioLines(
    'ARS',
    [{ moneda: 'JPY', total: 4200 }],
    ['JPY']
  )
  assert.deepEqual(lines, [{ moneda: 'JPY', total: 4200 }])
})

test('no se inventa ninguna moneda que el RPC no devolvió', () => {
  const lines = buildPortfolioLines('ARS', [{ moneda: 'ARS', total: 1000 }])
  assert.deepEqual(lines, [])
})

test('el total local usa el total_moneda_local del RPC', () => {
  assert.equal(resolveTotalLocal('ARS', 1234.56, [{ moneda: 'ARS', total: 999 }]), 1234.56)
})

test('si el RPC no calculó el total local, se usa la fila local (nunca ARS)', () => {
  assert.equal(resolveTotalLocal('EUR', null, [{ moneda: 'EUR', total: 77 }]), 77)
  assert.equal(resolveTotalLocal('EUR', undefined, []), 0)
})

test('entradas corruptas no rompen el render: nunca NaN', () => {
  const lines = buildPortfolioLines('ARS', [
    { moneda: 'EUR', total: 'abc' },
    { moneda: null, total: 10 },
    { moneda: 'GBP', total: '250' },
  ])
  assert.deepEqual(lines, [{ moneda: 'GBP', total: 250 }])
  assert.equal(resolveTotalLocal('ARS', 'abc', null), 0)
})