// tests/inversiones/ganancia-con-retiros.test.js
//
//   node --test tests/inversiones/ganancia-con-retiros.test.js
//
// S2 del dueño (2026-10-24): "la inversión XXX arrancó con un saldo de 1 millón, luego
// hice una liquidación parcial de 350 mil, el current value está en 650 mil, pero la
// ganancia está mal informada, aparece como una pérdida de 350 mil cuando en realidad
// fue un retiro. […] el capital original debería ser el capital inicial menos los
// retiros y aparecer en un lugar, entre paréntesis por ejemplo, los retiros que se
// hicieron. ej: Original capital (1000000) - (350000) : 650000 / current value 650000 /
// gain : 0"

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const { investmentGainAmount, investmentNetCapital } = await import(
  '../../src/lib/inversionesPatrimonio.ts'
)

const conRetiro = {
  monto_invertido_original: 1_000_000,
  valor_actual_teorico: 650_000,
  monto_liquidado: 350_000,
}

test('un retiro parcial no es una pérdida: el ejemplo del dueño da ganancia 0', () => {
  assert.equal(investmentGainAmount(conRetiro), 0)
  assert.equal(investmentNetCapital(conRetiro), 650_000)
})

test('sin retiros la cuenta es la de siempre', () => {
  const sinRetiro = { monto_invertido_original: 1000, valor_actual_teorico: 1100 }
  assert.equal(investmentGainAmount(sinRetiro), 100)
  assert.equal(investmentNetCapital(sinRetiro), 1000)
})

test('la ganancia sigue midiendo lo que devolvió la inversión, con o sin retiro', () => {
  // Mismo resultado total por dos caminos distintos: valor 900 con 100 retirados es el
  // mismo 0 que valor 1000 sin retiros.
  const conRetiro = { monto_invertido_original: 1000, valor_actual_teorico: 900, monto_liquidado: 100 }
  const sinRetiro = { monto_invertido_original: 1000, valor_actual_teorico: 1000 }
  assert.equal(investmentGainAmount(conRetiro), 0)
  assert.equal(investmentGainAmount(sinRetiro), 0)
})

test('el retiro como string (PostgREST) también se descuenta', () => {
  assert.equal(investmentGainAmount({
    monto_invertido_original: '1000000',
    valor_actual_teorico: '650000',
    monto_liquidado: '350000',
  }), 0)
})

test('la tarjeta muestra el capital neto con el desglose de los retiros', () => {
  const card = fs.readFileSync(path.join(repo, 'src/components/inversiones/InversionCard.tsx'), 'utf-8')
  assert.match(card, /investmentNetCapital\(inversion\)/)
  assert.match(card, /label_capital_breakdown/)
  // El desglose va condicionado: sin retiros no se muestra nada raro.
  assert.match(card, /retirado > 0 &&/)
  // Y el SQL ya devuelve el campo; la tarjeta tiene que leerlo.
  assert.match(card, /monto_liquidado\?: number/)
  const cartera = fs.readFileSync(path.join(repo, 'src/components/inversiones/CarteraWidget.tsx'), 'utf-8')
  assert.match(cartera, /monto_liquidado: Number\(inv\.monto_liquidado \?\? 0\)/)
})
