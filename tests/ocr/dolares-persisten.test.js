// tests/ocr/dolares-persisten.test.js
//
//   node --test tests/ocr/dolares-persisten.test.js
//
// Dueño (2026-11-02): "elijo que el pago es en dólares, guardo, pero [...] el valor se
// ha guardado como moneda local en lugar de dólares y si vuelvo a editar me doy cuenta
// que nunca se configuró el pago en dólares, el pago en dólares vuelve a aparecer
// apagado".
//
// Medido en la base (fila 1492, user 198): metadata.currency y metadata.payment.currency
// quedaron en USD y la columna moneda en GBP porque la tarjeta 821 es GBP. El guardado
// está bien; lo que falla es que la tarjeta lee primero item.moneda, que es la moneda del
// cargo, y descarta la moneda de la compra que eligió el usuario.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const tarjeta = fs.readFileSync(path.join(raiz, 'src', 'components', 'ocr', 'OcrTicketCard.tsx'), 'utf8')

test('la moneda de la compra sale del metadata antes que de la fila', () => {
  const alReves = (tarjeta.match(/item\.moneda \?\? fromMetadata\?\.currency/g) ?? []).length
  assert.equal(alReves, 0, 'la init sigue prefiriendo la moneda de la fila, que es la del cargo')
  const bien = (tarjeta.match(/fromMetadata\?\.currency \?\? item\.moneda/g) ?? []).length
  assert.equal(bien, 2, `la precedencia correcta aparece ${bien} veces y son dos ramas (tarjeta y billetera)`)
})

test('la eleccion sigue viajando al guardar', () => {
  const i = tarjeta.indexOf('const buildTicket')
  assert.ok(i > 0, 'no encuentro buildTicket')
  const bloque = tarjeta.slice(i, i + 1400)
  const veces = (bloque.match(/currency: currency \? currency\.toUpperCase\(\) : null,/g) ?? []).length
  assert.equal(veces, 2, 'buildTicket tiene que mandar la moneda en el ticket y en el pago')
})

test('sin red: el toggle escribe USD al encender', () => {
  assert.match(tarjeta, /currency: event\.target\.checked \? 'USD' : localCurrencyCode/)
})
