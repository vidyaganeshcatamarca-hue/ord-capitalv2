// tests/inversiones/ganancia-en-monto.test.js
//
//   node --test tests/inversiones/ganancia-en-monto.test.js
//
// S3 del dueño (2026-10-23, verbatim):
//   "la ganancia aparece mal en número, no está haciendo bien la resta, sino que
//    está mostrando el porcentaje, pero lo muestra como número. Ahí debe mostrar
//    la ganancia en número, no el porcentaje."
//
// Medido: Bitcoin capital ARS 500.000 → valor ARS 350.000 mostraba `+ARS 10` y
// Cripto try R$ 2.500,00 → R$ 3.000,00 mostraba `+R$ 20,00`. El 10 y el 20 eran
// `rendimiento_nominal` (porcentaje) impresos con `formatCurrency`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const { investmentGainAmount } = await import('../../src/lib/inversionesPatrimonio.ts')

test('la ganancia es la resta, no el porcentaje', () => {
  // Bitcoin: capital 500.000, valor 350.000 -> se perdió 150.000.
  assert.equal(
    investmentGainAmount({ monto_invertido_original: 500000, valor_actual_teorico: 350000 }),
    -150000
  )
  // Cripto try: capital 2.500, valor 3.000 -> se ganó 500 (no 20).
  assert.equal(
    investmentGainAmount({ monto_invertido_original: 2500, valor_actual_teorico: 3000 }),
    500
  )
})

test('sin cambios en el valor la ganancia es cero', () => {
  assert.equal(
    investmentGainAmount({ monto_invertido_original: 1000, valor_actual_teorico: 1000 }),
    0
  )
})

test('los datos del RPC llegan como string y se respetan', () => {
  assert.equal(
    investmentGainAmount({ monto_invertido_original: '2500.00', valor_actual_teorico: '3000.00' }),
    500
  )
})

test('sin datos no se inventa una ganancia', () => {
  assert.equal(investmentGainAmount(null), null)
  assert.equal(investmentGainAmount({}), null)
  assert.equal(
    investmentGainAmount({ monto_invertido_original: null, valor_actual_teorico: 100 }),
    null
  )
})

test('la tarjeta usa la resta y no el porcentaje', () => {
  const src = read('src/components/inversiones/InversionCard.tsx')
  assert.match(src, /investmentGainAmount\(/, 'la tarjeta debe calcular el monto')
  assert.ok(
    !/formatGain\(inversion\.rendimiento_nominal/.test(src),
    'el porcentaje no puede ir con formato de moneda'
  )
})
