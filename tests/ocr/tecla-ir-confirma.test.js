// tests/ocr/tecla-ir-confirma.test.js
//
//   node --test tests/ocr/tecla-ir-confirma.test.js
//
// Dueño (2026-11-02): "cuando quiero ingresar manualmente el importe de una categoría,
// el botón ir no cumple ninguna función, no funciona directamente. No hace las veces de
// OK o de Enter del valor ingresado. Tengo que cerrar, cliquear fuera de la pantalla
// para que se me tome el valor ingresado".
//
// El campo del importe confirma en onBlur, pero la tecla "IR" del teclado numérico no
// soltaba el foco, así que no confirmaba nada. El repo ya tiene el contrato en
// src/lib/numericKeyboard.ts (ronda 7, S1); al input de OCR le faltaba usarlo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const leer = (...partes) => fs.readFileSync(path.join(raiz, ...partes), 'utf8')

const tarjeta = leer('src', 'components', 'ocr', 'OcrTicketCard.tsx')
const teclado = leer('src', 'lib', 'numericKeyboard.ts')

test('el input del importe usa el contrato del Enter del repo', () => {
  assert.match(
    tarjeta,
    /import \{ NUMERIC_INPUT_ENTER_PROPS \} from '@\/lib\/numericKeyboard'/,
    'la tarjeta de OCR no importa el contrato del Enter',
  )
  const usos = (tarjeta.match(/\{\.\.\.NUMERIC_INPUT_ENTER_PROPS\}/g) ?? []).length
  assert.ok(usos >= 2, `el contrato se esparce ${usos} veces; el importe y las cuotas lo necesitan`)
})

test('el campo del importe final lleva el par completo', () => {
  const i = tarjeta.indexOf('ocr-net-')
  assert.ok(i > 0, 'no encuentro el input del importe final')
  const bloque = tarjeta.slice(i, i + 700)
  assert.match(bloque, /\{\.\.\.NUMERIC_INPUT_ENTER_PROPS\}/, 'el input del importe no suelta el foco con la tecla IR')
  assert.match(bloque, /onBlur=\{/, 'el input del importe perdio la confirmacion al salir')
})

test('sin debilitar el contrato: la tecla IR sigue soltando el foco y no guarda', () => {
  assert.match(teclado, /event\.preventDefault\(\)/)
  assert.match(teclado, /event\.currentTarget\.blur\(\)/)
  assert.match(teclado, /enterKeyHint: 'done'/)
})
