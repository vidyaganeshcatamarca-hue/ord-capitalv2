// tests/inversiones/donut-porcentajes-separados.test.js
//
//   node --test tests/inversiones/donut-porcentajes-separados.test.js
//
// S1 del dueño (ronda 6): "los por centajes en el Donut quedan pegados al Donut y los
// debes separar un poquito del margen para que no toquen el color y se puedan ver
// visualmente bien."
//
// El bug real: el hueco se medía hasta el CENTRO del texto. Con 8px y un trazo de 18px de
// grosor (9px de radio), el número quedaba montado sobre el anillo. Este test pinea la
// distancia mínima entre el borde externo del anillo y el porcentaje, y que las etiquetas
// que sobresalen de la caja se sigan viendo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const donut = fs.readFileSync(
  path.join(repo, 'src', 'components', 'inversiones', 'DistribucionDonut.tsx'),
  'utf8'
)
const css = fs
  .readFileSync(path.join(repo, 'src', 'components', 'inversiones', 'DistribucionView.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

test('el porcentaje se dibuja por fuera del anillo, con una separación visible', () => {
  const m = donut.match(/const labelRadius = radius \+ strokeWidth \/ 2 \+ (\d+)/)
  assert.ok(m, 'labelRadius tiene que declararse como radio + medio trazo + hueco')

  const hueco = Number(m[1])
  // El hueco se mide hasta el CENTRO del texto, así que hay que descontarle media altura
  // de la caja (~6px). Medido en pantalla con 412px de ancho: con 8px el número pisaba el
  // anillo; con 16px quedaban 2,2px libres; con 24px, 10-12px. Por eso el mínimo es 22.
  assert.ok(
    hueco >= 22,
    `la separación entre el anillo y el porcentaje tiene que ser de al menos 22px, es ${hueco}`
  )

  // Y el número tiene que seguir fuera del anillo, no adentro.
  assert.match(donut, /class\w*=\\?"distribucion-donut-pct\\?"/)
})

test('las etiquetas que sobresalen de la caja no se recortan', () => {
  // Al agrandar el hueco el texto se sale del viewBox; sin esto se cortaría.
  assert.match(
    css,
    /\.distribucion-donut-svg\s*\{[^}]*overflow:\s*visible/,
    '.distribucion-donut-svg tiene que dejar ver el contenido que sale de la caja'
  )
})

test('el porcentaje sigue dibujándose una vez por porción y sin el 100% central', () => {
  const pct = donut.match(/distribucion-donut-pct/g) || []
  assert.equal(pct.length, 1, 'el porcentaje va en un único lugar del render')
  assert.doesNotMatch(donut, />\s*100%\s*</, 'el centro del donut ya no muestra 100%')
})
