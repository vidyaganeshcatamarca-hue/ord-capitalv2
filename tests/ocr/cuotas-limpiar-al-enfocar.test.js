// tests/ocr/cuotas-limpiar-al-enfocar.test.js
//
//   node --test tests/ocr/cuotas-limpiar-al-enfocar.test.js
//
// Dueño (2026-11-02): "cuando elijo pagar con tarjeta, la opción de cuotas, fíjate que
// me edita el número cuando hago clic dentro de la ventana. Dijimos que el clic dentro
// de la ventana, lo que tengo que hacer es borrar la cantidad de cuotas sugeridas para
// permitirme ingresar un valor. Pero en este campo se produce una edición como primera
// opción".
//
// El campo hacía select() en el foco, que en Android abre el menú nativo de
// Cortar/Copiar en lugar de dejar el campo listo para escribir.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const tarjeta = fs.readFileSync(path.join(raiz, 'src', 'components', 'ocr', 'OcrTicketCard.tsx'), 'utf8')

test('el primer toque en cuotas limpia el sugerido en vez de seleccionarlo', () => {
  assert.match(
    tarjeta,
    /onFocus=\{\(\) => setInstallmentsInput\(''\)\}/,
    'el campo de cuotas no se limpia al enfocar',
  )
  assert.ok(
    !tarjeta.includes('event.target.select()'),
    'el campo sigue seleccionando el valor, que en Android abre el menu de copiar',
  )
})

test('salir sin escribir devuelve un valor usable', () => {
  assert.match(tarjeta, /onBlur=\{/, 'el campo de cuotas no repone nada al salir')
  assert.match(
    tarjeta,
    /current === '' \? String\(payment\.installments \?\? 1\) : current/,
    'si se sale con el campo vacio queda vacio y sin cuotas',
  )
})

test('un campo vacio sigue valiendo una cuota', () => {
  assert.match(tarjeta, /Math\.max\(1, Number\(installmentsInput\) \|\| 1\)/)
})
