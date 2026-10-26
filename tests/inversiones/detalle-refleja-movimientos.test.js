// tests/inversiones/detalle-refleja-movimientos.test.js
//
//   node --test tests/inversiones/detalle-refleja-movimientos.test.js
//
// S5 del dueño (2026-10-26): "cuando entras al detalle de la inversión [...] aparece el
// original capital, pero no aparecen los datos que hemos modificado que me digan los
// retiros o el agregado de capital [...] fíjate que ahora Current Value no coincide y
// pareciera ser una pérdida. Es el mismo arreglo que hicimos antes en la pantalla
// general. (inicial + agregados − retiros)"
//
// Y el mismo día, sobre el modal de aporte: la billetera de efectivo aparecía con la clave
// cruda `wallet_cash_default_name` porque ese selector no la traducía.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const leer = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8')

const { investmentNetCapital } = await import('../../src/lib/inversionesPatrimonio.ts')
const { splitInversionDetalle } = await import('../../src/lib/inversionesLabels.ts')

test('el detalle usa el capital neto, igual que la tarjeta', () => {
  const vista = leer('src/components/inversiones/DetalleInversionView.tsx')
  assert.match(vista, /import \{ investmentNetCapital \}/, 'tiene que usar el mismo helper')
  assert.match(vista, /formatCurrency\(capitalNeto \?\? data\.monto_invertido_original, moneda\)/)

  // Bitcoin real: 600.000 guardados con 200.000 retirados → 400.000, no 600.000.
  assert.equal(
    investmentNetCapital({ monto_invertido_original: 600_000, monto_liquidado: 200_000 }),
    400_000
  )
})

test('el desglose del detalle no repite la moneda', () => {
  const vista = leer('src/components/inversiones/DetalleInversionView.tsx')
  const bloque = vista.slice(vista.indexOf("t('label_capital_breakdown'"), vista.indexOf("t('label_capital_breakdown'") + 400)
  assert.match(bloque, /initial:\s*formatCurrencyNumber\(/)
  assert.match(bloque, /withdrawn:\s*formatCurrencyNumber\(/)
  assert.doesNotMatch(bloque, /formatCurrency\(/)
})

test('el detalle lista los aportes y los retiros que explican el capital', () => {
  const vista = leer('src/components/inversiones/DetalleInversionView.tsx')
  assert.match(vista, /'investment_contribution:'/, 'los aportes salen del historial')
  assert.match(vista, /'rescate_inversion:'/, 'los retiros también')
  assert.match(vista, /className="detalle-capital-movimientos"/)
  assert.match(vista, /aportesCapital\.length > 0 \|\| retirosCapital\.length > 1/)
  // Con un solo retiro el paréntesis ya lo dice: no se repite (misma regla que la tarjeta).
  assert.match(vista, /retirosCapital\.length > 1 &&/)
})

test('el historial reconoce el aporte y no lo muestra crudo', () => {
  // Sin esta clave, el detalle pintaba literalmente 'investment_contribution: Xxx'.
  const parseado = splitInversionDetalle('investment_contribution: Xxx')
  assert.ok(parseado, 'el detalle del aporte tiene que ser una clave conocida')
  assert.equal(parseado.key, 'investment_contribution')
  assert.equal(parseado.value, 'Xxx')

  for (const idioma of ['es', 'en', 'pt']) {
    assert.match(
      leer(`src/locales/${idioma}.ts`),
      /^ {2}investment_contribution: "/m,
      `falta la etiqueta del aporte en ${idioma}`
    )
  }
})

test('el selector de billetera del aporte traduce la billetera de efectivo', () => {
  const modal = leer('src/components/inversiones/AportarCapitalModal.tsx')
  assert.match(modal, /import \{ catalogDisplayName \}/)
  assert.match(modal, /catalogDisplayName\(b\.nombre\)/)
  // El literal crudo era exactamente el bug: `{b.nombre}` sin traducir.
  assert.doesNotMatch(modal, /\{b\.nombre\}/, 'no puede quedar el nombre sin resolver')
})
