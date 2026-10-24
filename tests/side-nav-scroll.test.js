// tests/side-nav-scroll.test.js
//
//   node --test tests/side-nav-scroll.test.js
//
// Reportado por el dueño el 2026-10-24 (captura en PC): "no puedo en pc desplegar
// el scroll al menu de configuracion [...] no puedo entrar desde alli a
// configuracion para cerrar la sesion."
//
// La barra lateral es `position: fixed; height: 100vh` y su lista de ítems no tenía
// ni flex ni scroll: al no entrar en la altura, la lista crecía y empujaba lo de
// abajo fuera de la pantalla. Configuración es un ítem de esa lista
// (NAV_ITEMS, `/configuracion`), así que quedaba inalcanzable.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const css = read('src/components/SideNav/SideNav.css')

function block(selector) {
  const start = css.indexOf(selector + ' {')
  assert.ok(start >= 0, `falta el bloque ${selector}`)
  return css.slice(start, css.indexOf('}', start) + 1)
}

test('la lista de ítems del sidebar scrollea', () => {
  const items = block('.side-nav-items')
  assert.match(items, /overflow-y:\s*auto/, 'sin esto los últimos ítems no se alcanzan')
  assert.match(items, /min-height:\s*0/, 'sin min-height 0 un hijo flex no puede encogerse')
  assert.match(items, /flex:\s*1\s+1\s+auto/, 'la lista toma el espacio disponible')
})

test('el pie del sidebar no se va de la pantalla', () => {
  const footer = block('.side-nav-footer')
  assert.match(footer, /flex:\s*0\s+0\s+auto/, 'el pie no puede encogerse ni empujarse')
})

test('Configuración es un ítem de la lista que ahora scrollea', () => {
  const nav = read('src/constants/navigation.tsx')
  const seccion = nav.slice(nav.indexOf("path: '/configuracion'"))
  assert.ok(seccion.length > 0, 'la ruta de configuración tiene que seguir en el menú')
  const tsx = read('src/components/SideNav/SideNav.tsx')
  assert.match(tsx, /className="side-nav-items"/, 'y renderizarse dentro de esa lista')
})
