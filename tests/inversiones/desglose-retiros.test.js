// tests/inversiones/desglose-retiros.test.js
//
//   node --test tests/inversiones/desglose-retiros.test.js
//
// S3 del dueño (ronda 6): "lo que está entre paréntesis, incluye el nombre de la moneda.
// Dice ARS 500.000 menos ARS 200.000 Withdrawal, lo cual el nombre de la moneda es
// redundante, porque ya está el nombre de la moneda antes […] Así que quita el nombre de
// la moneda de lo que está entre paréntesis. Y a medida que se van haciendo retiros,
// tienen que irse sumando los retiros abajo de ARS 200.000, como una lista de retiros si
// hubiera más de uno."
//
// Dos reglas: el desglose no repite la moneda, y los retiros se listan uno por uno.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const card = fs.readFileSync(
  path.join(repo, 'src', 'components', 'inversiones', 'InversionCard.tsx'),
  'utf8'
)
const cardCss = fs
  .readFileSync(path.join(repo, 'src', 'components', 'inversiones', 'InversionCard.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function bloqueDesde(texto, ancla, cierre = '}') {
  const inicio = texto.indexOf(ancla)
  assert.ok(inicio >= 0, `no encontré "${ancla}"`)
  return texto.slice(inicio, texto.indexOf(cierre, inicio) + 1)
}

test('el desglose del capital no repite el nombre de la moneda', () => {
  const bloque = bloqueDesde(card, "t('label_capital_breakdown'")
  assert.match(bloque, /initial:\s*formatCurrencyNumber\(/, 'el capital inicial va sin símbolo')
  assert.match(bloque, /withdrawn:\s*formatCurrencyNumber\(/, 'los retiros van sin símbolo')
  assert.doesNotMatch(
    bloque,
    /formatCurrency\(/,
    'formatCurrency agrega símbolo y/o código de moneda: es exactamente lo que se pidió quitar'
  )
})

test('la cifra grande del capital sí conserva la moneda', () => {
  // La moneda no se repite DENTRO del paréntesis: se dice una sola vez, en la cifra
  // grande. (Ojo con buscar sólo la clase `inversion-card-amount`: también aparece en
  // `gainClassFor`, donde no hay ningún monto.)
  assert.match(
    card,
    /formatCurrency\(capitalNeto \?\? inversion\.monto_invertido_original, inversion\.moneda\)/,
    'la cifra grande del capital tiene que seguir mostrando la moneda'
  )
})

test('los retiros se listan uno por uno, debajo del capital', () => {
  assert.match(
    card,
    /retirosDeLaInversion\.map\(/,
    'tiene que recorrer los retiros, no mostrar sólo el total'
  )
  assert.match(card, /className="inversion-card-withdrawals"/, 'falta la lista de retiros')
  assert.match(card, /className="inversion-card-withdrawal"/, 'falta el ítem de cada retiro')
  // Con el signo menos, que es lo que dice el dueño: los retiros se van sumando abajo.
  assert.match(card, /−\{formatCurrencyNumber\(/, 'cada retiro va con su signo menos')
  // Y sin símbolo de moneda, igual que el paréntesis.
  assert.doesNotMatch(
    bloqueDesde(card, 'inversion-card-withdrawals'),
    /formatCurrency\(/,
    'la lista tampoco repite la moneda'
  )
})

test('la lista se ve como lista: una línea por retiro, cifras alineadas', () => {
  const lista = bloqueDesde(cardCss, '.inversion-card-withdrawals {')
  assert.match(lista, /flex-direction:\s*column/, 'un retiro por línea')
  assert.match(lista, /list-style:\s*none/, 'sin viñetas')
  const item = bloqueDesde(cardCss, '.inversion-card-withdrawal {')
  assert.match(item, /font-variant-numeric:\s*tabular-nums/, 'las cifras tienen que alinearse')
})

test('los retiros llegan desde la RPC y no se inventan en el cliente', () => {
  const page = fs.readFileSync(
    path.join(repo, 'src', 'pages', 'Inversiones', 'InversionesPage.tsx'),
    'utf8'
  )
  assert.match(page, /rpc<RetiroRpcRow\[\]>\('fn_retiros_inversiones'\)/)

  const widget = fs.readFileSync(
    path.join(repo, 'src', 'components', 'inversiones', 'CarteraWidget.tsx'),
    'utf8'
  )
  assert.match(widget, /retiros=\{retiros\?\.\[inv\.inversion_id\]\}/, 'la tarjeta recibe sus retiros')
})
