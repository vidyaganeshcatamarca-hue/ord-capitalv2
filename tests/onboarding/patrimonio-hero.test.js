// tests/onboarding/patrimonio-hero.test.js
// Lineas del hero del Home con monedas extra libres (S18 de monedas-extra-libres).
//
//   node --test tests/onboarding/patrimonio-hero.test.js
//
// Importa el modulo real con type stripping: src/lib/patrimonioHero.ts
// no tiene imports propios.
//
// Reglas decididas con el dueño (S18 + R4pt invariante):
//   * Número grande = bucket local (total_pesos del RPC) — sin consolidación
//     (decisión A7: "como hoy: bucket local + líneas").
//   * Una línea por cada moneda del usuario CON saldo != 0; la local NO se
//     lista como línea (ya es el número grande). Orden: extra 1a, extra 2a,
//     luego cualquier otra moneda con saldo (p.ej. billetera antigua fuera
//     del set del usuario) — nunca inventada, siempre del shape jsonb.
//   * USD conserva su posición si es 2a moneda (default); si el usuario no
//     tiene USD activa, su línea simplemente no aparece.
//   * totales_por_monedaспондels vacío  -> sin líneas.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildHeroLines } from '../../src/lib/patrimonioHero.ts'

const totales = (rows) => rows.map((r) => ({ moneda: r[0], total: r[1] }))

test('local primera NO se lista como línea: solo extras con saldo', () => {
  const out = buildHeroLines('ARS', totales([['ARS', 1500000], ['USD', 400], ['EUR', 5000]]))
  assert.deepEqual(out, [
    { moneda: 'USD', total: 400 },
    { moneda: 'EUR', total: 5000 },
  ])
})

test('default del usuario ARS+USD: línea única USD (idéntico a lo que hoy ve)', () => {
  const out = buildHeroLines('ARS', totales([['ARS', 1500000], ['USD', 400]]))
  assert.deepEqual(out, [{ moneda: 'USD', total: 400 }])
})

test('extras vacias o sin saldo: sin líneas (USD en cero no se muestra, como hoy)', () => {
  assert.deepEqual(buildHeroLines('ARS', totales([['ARS', 1500000], ['USD', 0]])), [])
  assert.deepEqual(buildHeroLines('ARS', []), [])
})

test('orden: extras del usuario (orden de configuración), luego huérfanas con saldo', () => {
  const out = buildHeroLines(
    'ARS',
    totales([['ARS', 100], ['GBP', 3], ['USD', 400], ['EUR', 5000]]),
    ['USD', 'EUR']
  )
  assert.deepEqual(out, [
    { moneda: 'USD', total: 400 },
    { moneda: 'EUR', total: 5000 },
    { moneda: 'GBP', total: 3 },
  ])
})

test('sin extras pasadas: orden del RPC (comportamiento sin config cargada)', () => {
  const out = buildHeroLines('ARS', totales([['ARS', 100], ['GBP', 3], ['USD', 400]]))
  assert.deepEqual(out, [
    { moneda: 'GBP', total: 3 },
    { moneda: 'USD', total: 400 },
  ])
})

test('usuario EE.UU. (local=USD): su patrimonio grande es el total_pesos; extras EUR/GBP aparecen como línea', () => {
  const out = buildHeroLines('USD', totales([['USD', 90000], ['EUR', 5000]]))
  assert.deepEqual(out, [{ moneda: 'EUR', total: 5000 }])
})

test('normaliza mayusculas y trims; ignora filas molderas', () => {
  const out = buildHeroLines(' ars ', [
    { moneda: ' ars ', total: 1 },
    { moneda: 'usd', total: 2 },
    { moneda: '   ', total: 3 },
    { moneda: null, total: 4 },
  ])
  assert.deepEqual(out, [{ moneda: 'USD', total: 2 }])
})

test('totales con saldo negativo NO se ocultan (cuenta en rojo es informacion)', () => {
  const out = buildHeroLines('ARS', totales([['ARS', 1500], ['EUR', -50]]))
  assert.deepEqual(out, [{ moneda: 'EUR', total: -50 }])
})