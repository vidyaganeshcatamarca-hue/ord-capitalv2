// tests/inversiones/aportar-capital.test.js
//
//   node --test tests/inversiones/aportar-capital.test.js
//
// S6 del dueño (2026-10-24): "Cada inversión me permite retirar dinero completo,
// liquidándola o hacer retiros parciales. Pero en ningún lugar tengo la opción de agregar
// dinero a una inversión. [...] puedo comprar más bitcoins del mismo tipo. Y eso no
// debería registrarse como una nueva inversión, sino que la podría poder agregar a una
// inversión ya hecha. [...] deberíamos tener un tercer botón, quizás más pequeño, que
// diga algo parecido a agregar capital."

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf-8')

const sql = read('temp_sql/98_aportar_capital_inversion.sql')
// Sin comentarios para las aserciones de AUSENCIA: el propio archivo documenta que no
// toca `valor_mercado_actual` ni `fecha_inicio`, y esas menciones hacen fallar un
// `!/x/.test(sql)`. Misma trampa que ya mordió dos veces en los tests de CSS.
const sqlSinComentarios = sql.replace(/--.*$/gm, '')

test('agregar capital no crea una inversión nueva: sube el capital de la existente', () => {
  assert.match(sql, /SET monto_invertido_original = monto_invertido_original \+ p_monto/)
  assert.ok(!/INSERT INTO public\.p_inversiones/i.test(sql), 'no se inserta una inversión nueva')
})

test('el dinero sale de la billetera como egreso con la categoría de inversiones', () => {
  assert.match(sql, /INSERT INTO public\.p_caja \(/)
  assert.match(sql, /'expense'/, 'es una salida de la billetera')
  assert.match(sql, /tipo_cupo = 'investment'/, 'misma categoría que el alta de una inversión')
  assert.match(sql, /'es_aporte', true/, 'el movimiento se distingue de una liquidación')
})

test('valida lo mismo que liquidar: dueño, inversión vigente, billetera y moneda', () => {
  assert.match(sql, /WHERE inversion_id = p_inversion_id AND user_id = v_user_id/)
  assert.match(sql, /estado = 'finalizada'[\s\S]*error_investment_already_liquidated/)
  assert.match(sql, /WHERE billetera_id = p_billetera_origen_id AND user_id = v_user_id/)
  assert.match(sql, /error_wallet_currency_mismatch/)
  assert.match(sql, /p_monto <= 0[\s\S]*error_amount_required/)
})

test('no inventa datos de la inversión: ni fecha, ni valor de mercado, ni retiros', () => {
  // Sumar capital no es una inversión nueva (fecha_inicio se mantiene), cuánto vale hoy
  // lo carga el dueño con "Update value", y los retiros anteriores siguen siendo retiros.
  assert.ok(!/valor_mercado_actual/.test(sqlSinComentarios), 'no toca el valor de mercado')
  assert.ok(!/fecha_inicio/.test(sqlSinComentarios), 'no reinicia la antigüedad')
  assert.ok(!/monto_liquidado\s*=/.test(sqlSinComentarios), 'no borra ni pisa los retiros')
})

test('la tarjeta y el detalle ofrecen el tercer botón, y la página lo conecta', () => {
  const card = read('src/components/inversiones/InversionCard.tsx')
  assert.match(card, /btn_add_capital/)
  assert.match(card, /inversion-card-btn--add/)
  assert.match(card, /estado_inversion !== 'finalizada'/)

  const detalle = read('src/components/inversiones/DetalleInversionView.tsx')
  assert.match(detalle, /detalle-action-btn--add/)

  const page = read('src/pages/Inversiones/InversionesPage.tsx')
  assert.match(page, /AportarCapitalModal/)
  assert.match(page, /onAddCapital=\{handleAddCapital\}/)

  // La RPC la llama el modal, no la página.
  const modal0 = read('src/components/inversiones/AportarCapitalModal.tsx')
  assert.match(modal0, /fn_aportar_inversion/, 'el modal llama a la RPC de aporte')

  // Y el modal usa la convención de la carpeta, no clases inventadas.
  const modal = read('src/components/inversiones/AportarCapitalModal.tsx')
  assert.match(modal, /actualizar-valor-modal-card/)
  assert.match(modal, /btn btn-primary/)
})
