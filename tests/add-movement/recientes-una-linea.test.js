// tests/add-movement/recientes-una-linea.test.js
//
//   node --test tests/add-movement/recientes-una-linea.test.js
//
// Dueño (2026-11-02): "quiero que los íconos se muestren más grandes, un 50% más
// grande del tamaño actual. Tienen que entrar los 5 íconos que se muestran, que son los
// últimos 5 usados, y la palabra ver todas, el botón ver todas, tienen que entrar en una
// sola línea [...] si no lo adaptas a una sola línea. El botón ver todas, creo que le
// está faltando un bordecito de contraste, fíjate que funcione para modo claro y modo
// oscuro."
//
// Medido antes del cambio: los iconos eran de 32x32 en estilos en línea y la fila tenía
// flexWrap: 'wrap', que es exactamente lo que la partía en dos líneas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const leer = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8')

const modal = leer('src', 'components', 'AddMovementModal', 'AddMovementModal.tsx')
const css = leer('src', 'components', 'AddMovementModal', 'AddMovementModal.css')

test('la fila de recientes no puede partirse en dos lineas', () => {
  assert.match(modal, /className="mobile-frecuentes-row"/, 'la fila no usa la clase que la mantiene en una linea')
  assert.match(css, /\.mobile-frecuentes-row\s*\{[^}]*flex-wrap:\s*nowrap/, 'la fila puede envolver')
})

test('los iconos crecen 50% y encogen si no entran', () => {
  assert.match(css, /\.cat-recent-icon-btn\s*\{[^}]*min\(48px,/, 'el icono no esta a 48px con encogimiento')
  assert.match(css, /\.cat-recent-icon-btn\s*\{[^}]*aspect-ratio:\s*1/, 'el icono no se mantiene circular')
  assert.match(modal, /<CategoryIcon name=\{cat\.icono\} size=\{30\} \/>/, 'el icono interno sigue a 20 en vez de 30')
})

test('ver todas tiene borde de contraste que sirve en los dos temas', () => {
  assert.match(css, /\.cat-recent-see-all\s*\{[^}]*border:\s*1px solid var\(--border/, 'el boton no tiene borde de contraste')
  assert.match(css, /\.cat-recent-see-all\s*\{[^}]*flex:\s*0 0 auto/, 'el boton no queda en la misma linea')
})

test('la etiqueta del boton sale de i18n, no hardcodeada', () => {
  assert.match(modal, /t\('add_move_see_all'\)/, 'el boton no usa la clave de traduccion')
  assert.ok(!/>\s*Ver todas\s*</.test(modal), 'el texto Ver todas sigue hardcodeado en el JSX')
  for (const archivo of ['es.ts', 'en.ts', 'pt.ts']) {
    assert.match(leer('src', 'locales', archivo), /add_move_see_all:/, `falta la clave en ${archivo}`)
  }
})
