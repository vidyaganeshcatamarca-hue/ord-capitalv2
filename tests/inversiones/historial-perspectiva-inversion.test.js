// tests/inversiones/historial-perspectiva-inversion.test.js
//
//   node --test tests/inversiones/historial-perspectiva-inversion.test.js
//
// S1 del dueño (2026-10-23, verbatim):
//   "tenemos los signos y los colores cambiados para este caso, lo que está con
//    signo menos es lo que agregamos a la inversión por lo tanto tiene que estar
//    en positivo y en verde y lo que está en verde tiene que estar en negativo y
//    en rojo porque es lo que sacamos o lo que perdimos"
//
// El RPC entrega el historial con la perspectiva de la CAJA: aportar a una
// inversión es un `expense` (negativo) y rescatar es un `income` (positivo). El
// historial que se muestra es el de LA INVERSIÓN, así que el signo se invierte.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const { investmentMovementAmount } = await import(
  '../../src/lib/inversionesMovimientos.ts'
)

test('un aporte llega negativo desde la caja y se muestra positivo', () => {
  // `Inversión: Prueba -$ 100` tiene que pasar a `+$ 100`.
  assert.equal(investmentMovementAmount(-100), 100)
})

test('un rescate llega positivo desde la caja y se muestra negativo', () => {
  // `Rescate de inversión: Bitcoin $ 200.000` tiene que pasar a `-$ 200.000`.
  assert.equal(investmentMovementAmount(200000), -200000)
})

test('sin monto no se inventa un signo', () => {
  assert.equal(investmentMovementAmount(null), null)
  assert.equal(investmentMovementAmount(undefined), null)
  assert.equal(investmentMovementAmount(Number.NaN), null)
})

test('cero sigue siendo cero', () => {
  assert.equal(investmentMovementAmount(0), 0)
})

test('invertir dos veces vuelve al original', () => {
  for (const v of [100, -100, 200000, -0.5]) {
    assert.equal(investmentMovementAmount(investmentMovementAmount(v)), v)
  }
})

test('la vista del detalle usa la perspectiva de la inversión', () => {
  const src = read('src/components/inversiones/DetalleInversionView.tsx')
  assert.match(
    src,
    /investmentMovementAmount\(/,
    'el detalle debe convertir el monto, no pintar el de la caja'
  )
  assert.ok(
    !/movementClassFor\(mov\.monto\)/.test(src),
    'el color no puede salir del monto crudo (es el signo de la caja)'
  )
})

test('la vista muestra el signo explícito, no solo el color', () => {
  const src = read('src/components/inversiones/DetalleInversionView.tsx')
  // El dueño pidió signo Y color: verde con `+`, rojo con `-`.
  assert.ok(
    /`\+\$\{formatCurrency\(/.test(src) || /'\s*\+\s*'/.test(src),
    'los montos positivos llevan `+` explícito delante de la moneda'
  )
})
