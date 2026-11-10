// tests/ocr/aviso-no-duplicado.test.js
//
//   node --test tests/ocr/aviso-no-duplicado.test.js
//
// Dueño (2026-11-02): "Cuando editamos en cuarentena un gasto cargado con OCR y no
// coincide la suma de las subcategorías con el total, aparece el mensaje duplicado".
//
// OcrTicketCard dibuja el aviso de suma distinta cuando grouping.material_mismatch,
// y además dibuja el bloqueador, que es groupingBlocker(): esa función devuelve
// justamente 'ocr.material_mismatch' en ese caso, así que el mismo texto salía dos
// veces, uno debajo del otro.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const leer = (...partes) => fs.readFileSync(path.join(raiz, ...partes), 'utf8')

const tarjeta = leer('src', 'components', 'ocr', 'OcrTicketCard.tsx')
const grouping = leer('src', 'ocr', 'grouping.ts')

test('el aviso de suma distinta se dibuja una sola vez', () => {
  assert.match(
    tarjeta,
    /const duplicateBlockerKey = grouping\.material_mismatch \? 'ocr\.material_mismatch' : null/,
    'falta registrar que aviso ya se dibujo arriba, asi el bloqueador lo repite',
  )
  assert.match(
    tarjeta,
    /\{blocker && blocker !== duplicateBlockerKey && \(/,
    'el parrafo del bloqueador se dibuja sin mirar si el aviso ya esta arriba',
  )
})

test('el aviso directo sigue siendo uno solo', () => {
  const directos = (tarjeta.match(/t\('ocr\.material_mismatch'\)/g) ?? []).length
  assert.equal(directos, 1, `el aviso directo aparece ${directos} veces`)
})

test('sin debilitar el bloqueo: la suma distinta sigue impidiendo confirmar', () => {
  assert.match(tarjeta, /saveDisabled=\{blocker !== null\}/)
  assert.match(tarjeta, /disabled=\{confirming \|\| blocker !== null\}/)
  assert.match(grouping, /if \(result\.material_mismatch\) return 'ocr\.material_mismatch'/)
  assert.match(grouping, /if \(!isClosureExact\(result\)\) return 'ocr\.material_mismatch'/)
})
