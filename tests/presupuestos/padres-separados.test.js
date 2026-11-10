// tests/presupuestos/padres-separados.test.js
//
//   node --test tests/presupuestos/padres-separados.test.js
//
// Dueño (2026-11-02): "cuando las diferentes categorías están todas contraídas, las que
// tienen subcategorías, no logro identificar bien la diferencia de una categoría con la
// otra. Quiero que dejes una pequeña línea de espacio entre una categoría padre y otra
// categoría padre [...] la regla sería todas las categorías padres están separaditas con
// una pequeña línea de espacio. Que se note que son tarjetas diferentes."
//
// No existía ninguna regla para eso: el padre con hijos trae margen propio, pero el padre
// sin hijos es una fila pelada que sólo se separa con un divisor de 1px, y al estar los
// dos plegados se leen como un bloque continuo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const css = fs.readFileSync(path.join(raiz, 'src', 'pages', 'Presupuestos', 'Presupuestos.css'), 'utf8')

test('hay aire entre un rubro padre y el siguiente', () => {
  const ancla = '.acord-grupo-body > * + *'
  const i = css.indexOf(ancla)
  assert.ok(i > 0, 'el contenedor no separa un rubro padre del siguiente')
  assert.match(
    css.slice(i, i + 300),
    /margin-top:\s*\d+px/,
    'la regla de separacion no tiene aire',
  )
})

test('el aire llega a las dos formas de padre', () => {
  // El padre con hijos es .sobre-grupo-bloque y el padre sin hijos es .sobre-fila:
  // la regla de hermanos tiene que aplicar a los dos, y el bloque necesita un selector
  // propio porque fija `margin: 0 16px 12px` con la misma especificidad.
  assert.match(
    css,
    /\.acord-grupo-body > \.sobre-grupo-bloque \+ \*/,
    'el padre con hijos quedaria sin aire',
  )
  assert.ok(
    !/\.sobre-grupo-bloque \+ \.sobre-grupo-bloque \{/.test(css),
    'la separacion se ato a una sola forma de padre',
  )
})

test('sin romper la animacion del acordeon', () => {
  assert.match(css, /\.acord-grupo-body\s*\{[^}]*max-height:\s*0/, 'se perdio el plegado del acordeon')
  assert.match(css, /\.acord-grupo-body\.abierto\s*\{[^}]*max-height/, 'se perdio la apertura del acordeon')
})
