// tests/inversiones/layout-idiomas-y-ganancia.test.js
//
//   node --test tests/inversiones/layout-idiomas-y-ganancia.test.js
//
// Ronda 6, tres pedidos del dueño:
//   S6 — "en español o en portugués no queda margen en el borde derecho. Lo curioso es que
//        cuando está en inglés está bien [...] verifica eso y verifica en todas las
//        pantallas si tenemos esa dificultad".
//   S7 — "en la línea de ganancias el porcentaje que representa de ganancia, esa ganancia,
//        porcentaje sobre el total de la inversión".
//   S8 — "al querer liquidar una inversión me permite editar el valor cuando en realidad
//        ese valor no se debe editar [...] solo me debe dejar editar cuando es parcial".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const leer = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8')
const cssDe = (rel) => leer(rel).replace(/\/\*[\s\S]*?\*\//g, '')

const { investmentGainPercent, investmentGainAmount, investmentNetCapital } = await import(
  '../../src/lib/inversionesPatrimonio.ts'
)

function bloque(css, ancla) {
  const i = css.indexOf(ancla)
  assert.ok(i >= 0, `no encontré ${ancla}`)
  return css.slice(i, css.indexOf('}', i) + 1)
}

// ---------------------------------------------------------------------------
// S6 — el desborde que dependía del idioma
// ---------------------------------------------------------------------------

test('la fila de botones de la tarjeta puede ceder y envolver', () => {
  const css = cssDe('src/components/inversiones/InversionCard.css')
  const acciones = bloque(css, '.inversion-card-actions {')
  // `flex-shrink: 0` era la causa: la fila no cedía ni un píxel y empujaba la tarjeta (y la
  // página) fuera del teléfono. En inglés los textos son más cortos y no se notaba.
  assert.doesNotMatch(acciones, /flex-shrink:\s*0/)
  assert.match(acciones, /flex-shrink:\s*1/)
  assert.match(acciones, /flex-wrap:\s*wrap/)
  assert.match(acciones, /min-width:\s*0/)
})

test('la tarjeta no puede crecer más que su columna', () => {
  const css = cssDe('src/components/inversiones/InversionCard.css')
  assert.match(bloque(css, '.inversion-card {'), /min-width:\s*0/)
  // El botón no se parte en dos líneas: si no entra, envuelve la fila.
  assert.match(bloque(css, '.inversion-card-btn {'), /white-space:\s*nowrap/)
})

test('los tres idiomas tienen traducido lo nuevo de la ronda 6', () => {
  for (const idioma of ['es', 'en', 'pt']) {
    assert.match(
      leer(`src/locales/${idioma}.ts`),
      /^ {2}modal_liquidate_total_locked_helper: "/m,
      `falta el texto del monto bloqueado en ${idioma}`
    )
  }
})

// ---------------------------------------------------------------------------
// S7 — el porcentaje de ganancia
// ---------------------------------------------------------------------------

test('el porcentaje es la ganancia sobre el capital neto', () => {
  // Xxx: 1.200.000 de capital, 1.200.000 de valor, sin retiros → 0%.
  assert.equal(
    investmentGainPercent({ monto_invertido_original: 1_200_000, valor_actual_teorico: 1_200_000, monto_liquidado: 0 }),
    0
  )
  // Bitcoin: capital 600.000, 200.000 retirados, valor 420.000 → +20.000 sobre 400.000 = 5%.
  assert.equal(
    investmentGainPercent({ monto_invertido_original: 600_000, valor_actual_teorico: 420_000, monto_liquidado: 200_000 }),
    5
  )
  // Perdida: 500.000 de capital neto y 450.000 de valor → -10%.
  assert.equal(
    investmentGainPercent({ monto_invertido_original: 500_000, valor_actual_teorico: 450_000, monto_liquidado: 0 }),
    -10
  )
})

test('el porcentaje se mide contra la misma base que la ganancia', () => {
  const inversion = { monto_invertido_original: 600_000, valor_actual_teorico: 420_000, monto_liquidado: 200_000 }
  const capital = investmentNetCapital(inversion)
  const ganancia = investmentGainAmount(inversion)
  // Si las bases no coincidieran, el porcentaje no cerraría con las dos cifras de la tarjeta.
  assert.equal(ganancia, 420_000 + 200_000 - 600_000)
  assert.equal(ganancia / capital, 0.05)
  assert.equal(investmentGainPercent(inversion), 5)
})

test('sin capital positivo no hay porcentaje que informar', () => {
  assert.equal(investmentGainPercent({ monto_invertido_original: 0, valor_actual_teorico: 10 }), null)
  assert.equal(investmentGainPercent({ monto_invertido_original: 100, monto_liquidado: 100, valor_actual_teorico: 5 }), null)
  assert.equal(investmentGainPercent(null), null)
})

test('la tarjeta muestra el porcentaje al lado de la ganancia, sin competir con ella', () => {
  const card = leer('src/components/inversiones/InversionCard.tsx')
  assert.match(card, /investmentGainPercent\(inversion\)/)
  assert.match(card, /className="inversion-card-gain-pct"/)
  assert.match(card, /formatPercent\(porcentajeGanancia, \{ decimals: 1 \}\)/)
  const css = cssDe('src/components/inversiones/InversionCard.css')
  const pct = bloque(css, '.inversion-card-gain-pct {')
  assert.match(pct, /font-size: calc\(11px/)
  assert.match(pct, /tabular-nums/)
})

// ---------------------------------------------------------------------------
// S8 — el monto de la liquidación total no se edita
// ---------------------------------------------------------------------------

test('la liquidación total muestra el valor como dato, no como campo editable', () => {
  const modal = leer('src/components/inversiones/LiquidarInversionModal.tsx')
  const desde = modal.indexOf("{tipo === 'total' ? (")
  const hasta = modal.indexOf(') : (', desde)
  assert.ok(desde > 0 && hasta > desde, 'no pude delimitar la rama de liquidación total')
  const ramaTotal = modal.slice(desde, hasta)

  assert.doesNotMatch(ramaTotal, /<input/, 'en la liquidación total no hay campo que editar')
  assert.match(ramaTotal, /className="liquidar-inversion-total-value"/)
  assert.match(ramaTotal, /role="text"/)
  assert.match(ramaTotal, /formatCurrency\(totalNum, moneda\)/, 'muestra el valor completo de la posición')
})

test('la liquidación parcial sí permite escribir el monto', () => {
  const modal = leer('src/components/inversiones/LiquidarInversionModal.tsx')
  const desde = modal.indexOf(') : (')
  const ramaParcial = modal.slice(desde, modal.indexOf('liquidar-inversion-ganancia-block', desde))
  assert.match(ramaParcial, /<input/)
  assert.match(ramaParcial, /value={montoRescate}/)
})
