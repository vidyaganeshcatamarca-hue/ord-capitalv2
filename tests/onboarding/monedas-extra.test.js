// tests/onboarding/monedas-extra.test.js
// Derivacion de opciones de moneda para el picker de billeteras (T2).
//
//   node --test tests/onboarding/monedas-extra.test.js
//
// Importa el modulo real con type stripping: funciona solo porque
// src/lib/monedasExtra.ts no tiene imports propios (mismo contrato que
// currencySymbol.ts).
//
// S11/S5: local + extras efectivas del usuario; el backend hace las
// validaciones de catalogo y limite (S9/S5), esta funcion solo arma la lista
// honesta para la UI: local primero, extras en el orden guardado, sin
// duplicados ni mayusculas inconsistentes.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildWalletCurrencyOptions } from '../../src/lib/monedasExtra.ts'

test('local primero + extras en orden guardado', () => {
  assert.deepEqual(buildWalletCurrencyOptions('ARS', ['USD', 'EUR']), ['ARS', 'USD', 'EUR'])
})

test('local repetido en extras se excluye (S10: un usuario USD ve solo su local)', () => {
  assert.deepEqual(buildWalletCurrencyOptions('USD', ['USD']), ['USD'])
})

test('normaliza a mayusculas y trims', () => {
  assert.deepEqual(buildWalletCurrencyOptions(' ars ', [' usd ', 'eur']), ['ARS', 'USD', 'EUR'])
})

test('dedupe: extras duplicadas o que repiten la local no se repiten', () => {
  assert.deepEqual(buildWalletCurrencyOptions('ARS', ['USD', 'usd', 'ARS']), ['ARS', 'USD'])
})

test('extras vacias -> solo la local', () => {
  assert.deepEqual(buildWalletCurrencyOptions('EUR', []), ['EUR'])
})

test('sin local (region sin resolver) -> solo extras normalizadas, no lista vacia', () => {
  assert.deepEqual(buildWalletCurrencyOptions(null, ['USD', 'EUR']), ['USD', 'EUR'])
  assert.deepEqual(buildWalletCurrencyOptions('', ['USD']), ['USD'])
})

test('sin nada -> lista vacia (nada inventado)', () => {
  assert.deepEqual(buildWalletCurrencyOptions(null, []), [])
})

test('entrada null/undefined no revienta', () => {
  assert.deepEqual(buildWalletCurrencyOptions('ARS', null), ['ARS'])
})