// tests/onboarding/transfer-titles.test.js
// Titulos de transferencias entre divisas (S17 de monedas-extra-libres).
//
//   node --test tests/onboarding/transfer-titles.test.js
//
// Importa el modulo real con type stripping: funciona solo porque
// src/lib/transferTitles.ts no tiene imports propios.
//
// Reglas (A6/S17, decidido con el dueño):
//   * misma moneda            -> 'transfer_entre_cuentas'
//   * destino = USD / origen = la local -> keys LEGACY exactas de hoy
//     ('compra de dólares' mantiene su texto; Intl diría 'dólar
//     estadounidense', y eso empeoraría la etiqueta actual)
//   * cualquier otro par cruzado -> detalle JSON {"key","params"} con el
//     CODIGO de moneda; el renderer resuelve el nombre humano (currencyName)
//   * compra = hacia el DESTINO; venta = desde el ORIGEN hacia la local
//   * sin moneda local / datos incompletos -> 'transfer_entre_cuentas'
//     (default seguro, igual que el backend legado)

import fs from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildTransferDetalle, translateDetalle } from '../../src/lib/transferTitles.ts'

test('misma moneda: transferencia entre cuentas', () => {
  assert.equal(buildTransferDetalle('ARS', 'ARS', 'ARS'), 'transfer_entre_cuentas')
  assert.equal(buildTransferDetalle('USD', 'USD', 'ARS'), 'transfer_entre_cuentas')
})

test('ARS -> USD (local ARS): key legacy compra_dolares', () => {
  assert.equal(buildTransferDetalle('ARS', 'USD', 'ARS'), 'transfer_compra_dolares')
})

test('GBP -> USD (local ARS): tambien compra_dolares (semantica del aprobador legado)', () => {
  assert.equal(buildTransferDetalle('GBP', 'USD', 'ARS'), 'transfer_compra_dolares')
})

test('USD -> ARS (local ARS): key legacy venta_dolares', () => {
  assert.equal(buildTransferDetalle('USD', 'ARS', 'ARS'), 'transfer_venta_dolares')
})

test('ARS -> EUR: JSON compra de EUR (compra hacia el destino)', () => {
  assert.deepEqual(
    JSON.parse(buildTransferDetalle('ARS', 'EUR', 'ARS')),
    { key: 'transfer_compra_moneda', params: { moneda: 'EUR' } }
  )
})

test('EUR -> ARS: JSON venta de EUR (venta desde el origen)', () => {
  assert.deepEqual(
    JSON.parse(buildTransferDetalle('EUR', 'ARS', 'ARS')),
    { key: 'transfer_venta_moneda', params: { moneda: 'EUR' } }
  )
})

test('USD -> GBP (local ARS): compra de GBP (naming por destino, preview A6)', () => {
  assert.deepEqual(
    JSON.parse(buildTransferDetalle('USD', 'GBP', 'ARS')),
    { key: 'transfer_compra_moneda', params: { moneda: 'GBP' } }
  )
})

test('GBP -> ARS: venta de GBP', () => {
  assert.deepEqual(
    JSON.parse(buildTransferDetalle('GBP', 'ARS', 'ARS')),
    { key: 'transfer_venta_moneda', params: { moneda: 'GBP' } }
  )
})

test('EUR -> GBP (sin involucrar la local): compra de GBP', () => {
  assert.deepEqual(
    JSON.parse(buildTransferDetalle('EUR', 'GBP', 'ARS')),
    { key: 'transfer_compra_moneda', params: { moneda: 'GBP' } }
  )
})

test('normaliza mayusculas y trims', () => {
  assert.equal(buildTransferDetalle(' ars ', ' usd ', 'ARS'), 'transfer_compra_dolares')
})

test('sin moneda local o con datos incompletos: entre_cuentas (default seguro)', () => {
  assert.equal(buildTransferDetalle('ARS', 'EUR', null), 'transfer_entre_cuentas')
  assert.equal(buildTransferDetalle('ARS', 'EUR', ''), 'transfer_entre_cuentas')
  assert.equal(buildTransferDetalle(null, 'EUR', 'ARS'), 'transfer_entre_cuentas')
  assert.equal(buildTransferDetalle('ARS', null, 'ARS'), 'transfer_entre_cuentas')
})

test('destino = la moneda local con origen extranjero distinto de USD: venta del origen', () => {
  assert.deepEqual(
    JSON.parse(buildTransferDetalle('ARS', 'EUR', 'EUR')),
    { key: 'transfer_venta_moneda', params: { moneda: 'ARS' } }
  )
})
// ── Owner tanda-3: the ACTIVITY RECENT title was rendering the raw JSON
// (t(nombre_categoria) with nombre_categoria carrying the transfer payload).
// The title now resolves the payload with the raw currency CODE ('Compra de
// ARS'); the human name ('peso argentino') stays in the suffix renderer.

test('activity title resolves the transfer payload with the raw currency code (owner tanda-3)', () => {
  const home = fs.readFileSync(new URL('../../src/pages/Home/HomePage.tsx', import.meta.url), 'utf-8')
  const categoryTitleIdx = home.indexOf('timeline-item-category')
  const windowStart = Math.max(0, categoryTitleIdx - 150)
  const titleRow = home.slice(windowStart, categoryTitleIdx + 700)
  assert.match(titleRow, /translateDetalle/, 'the title must resolve the JSON payload like the suffix does')
  assert.ok(!titleRow.includes('currencyName'), 'the title keeps the currency CODE; the human name lives in the suffix')
})

// ── Owner tanda 5: the tanda-3 title fix regressed every PLAIN label. The
// renderers passed nombre_categoria/detalle through parseTransferDetalle, whose
// non-JSON branch returns the string untouched — so `type_opening`,
// `cat_clothing`, `initial_balance` rendered as raw keys. translateDetalle is
// the single entry point: JSON payload -> params resolved; plain key -> t().

test('a plain key is translated, never returned raw', () => {
  const calls = []
  const translate = (key, params) => {
    calls.push([key, params])
    return `T(${key})`
  }
  assert.equal(translateDetalle('cat_clothing', translate), 'T(cat_clothing)')
  assert.equal(translateDetalle('type_opening', translate), 'T(type_opening)')
  assert.equal(translateDetalle('initial_balance', translate), 'T(initial_balance)')
  assert.equal(translateDetalle('cat_transport - Subte', translate), 'T(cat_transport - Subte)')
})

test('a JSON payload keeps resolving its params through the translator', () => {
  const translate = (key, params) => `${key}:${JSON.stringify(params)}`
  assert.equal(
    translateDetalle(JSON.stringify({ key: 'transfer_compra_moneda', params: { moneda: 'BRL' } }), translate),
    'transfer_compra_moneda:{"moneda":"BRL"}'
  )
})

test('an unknown key still passes through the translator (t is a passthrough)', () => {
  assert.equal(translateDetalle('', (key) => key), '')
  assert.equal(translateDetalle(undefined, (key) => key), '')
})
