// tests/inversiones/header-sin-recorte.test.js
//
//   node --test tests/inversiones/header-sin-recorte.test.js
//
// S4 del dueño (2026-10-23, verbatim):
//   "Fíjate la ventana principal de valores, en el header, que no se muestra bien
//    el valor total. Esto cuando la aplicación está en inglés lo muestra mal. Algo
//    pasa con el título que lo agranda y no puede meter bien los valores
//    completos, que aparezca el número completo. Si esto yo lo paso a español, lo
//    muestra bien."
//
// Medido: `MY PORTFOLIO (TOTAL)   ARS 1.258....` — el número salía con ellipsis.
// El CSS decía, textualmente, "The big number must never widen the row: it
// truncates instead". La regla correcta es la inversa: cede la etiqueta.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const css = fs.readFileSync(
  path.join(repo, 'src/components/inversiones/RendimientoRealWidget.css'),
  'utf-8'
)

/** Devuelve el cuerpo de un selector de primer nivel, sin anidar. */
function block(selector) {
  const start = css.indexOf(selector + ' {')
  assert.ok(start >= 0, `falta el bloque ${selector}`)
  const end = css.indexOf('}', start)
  return css.slice(start, end + 1)
}

test('el número del total no se recorta nunca', () => {
  const total = block('.rendimiento-real-total-ars')
  assert.ok(
    !/text-overflow:\s*ellipsis/.test(total),
    'el total no puede tener ellipsis: el número completo es el requisito'
  )
  assert.ok(
    !/overflow:\s*hidden/.test(total),
    'el total no puede esconder lo que no entra'
  )
  assert.match(total, /white-space:\s*nowrap/, 'el número no se parte en dos líneas')
  assert.match(
    total,
    /flex:\s*0\s+0\s+auto/,
    'el total no cede ancho: se queda con el que necesita'
  )
})

test('la etiqueta es la que cede espacio', () => {
  const title = block('.rendimiento-real-title')
  assert.match(title, /min-width:\s*0/, 'sin min-width: 0 el título no puede encogerse')
  assert.ok(
    !/flex-shrink:\s*0/.test(title),
    'el título no puede estar congelado: en inglés es largo'
  )
})

test('la fila del título puede pasar a dos líneas', () => {
  const row = block('.rendimiento-real-row--title')
  assert.match(
    row,
    /flex-wrap:\s*wrap/,
    'si el número no entra al lado del título, baja de línea antes que recortarse'
  )
})
