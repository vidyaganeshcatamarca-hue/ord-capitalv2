// tests/inversiones/modales-campos-en-form.test.js
//
//   node --test tests/inversiones/modales-campos-en-form.test.js
//
// T14(e) del verificador independiente sobre T12: "el test no cubre que todos los
// campos sigan dentro del form ni que los ids sean únicos". Un input fuera del form
// no se envía al submitir, y dos ids iguales rompen el label y el foco.
//
// Ojo con la regla: un campo envuelto por un <label> ya está etiquetado y NO
// necesita id propio (así están los radios de tipo de activo). La regla correcta es
// "id único si existe" + "etiqueta accesible siempre".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const MODALES = ['NuevaInversionModal', 'LiquidarInversionModal', 'ActualizarValorModal']

const leer = (n) => fs.readFileSync(path.join(repo, `src/components/inversiones/${n}.tsx`), 'utf-8')
const leerCss = (n) => fs.readFileSync(path.join(repo, `src/components/inversiones/${n}.css`), 'utf-8')

for (const modal of MODALES) {
  test(`${modal}: ids únicos y cada campo con etiqueta accesible`, () => {
    const src = leer(modal)
    // Recorro el fuente en orden llevando la profundidad de <label>: un campo
    // dentro de un label ya tiene etiqueta.
    const tokens = src.matchAll(/<label\b|<\/label>|<(input|select|textarea)\b[^>]*?\/?>/g)
    let dentroDeLabel = 0
    const ids = []
    const sinEtiqueta = []
    for (const tok of tokens) {
      const texto = tok[0]
      if (texto.startsWith('<label')) {
        dentroDeLabel++
      } else if (texto.startsWith('</label>')) {
        dentroDeLabel = Math.max(0, dentroDeLabel - 1)
      } else if (tok[1]) {
        const id = texto.match(/\bid="([^"]+)"/)
        if (id) ids.push(id[1])
        else if (dentroDeLabel === 0 && !/aria-label=/.test(texto)) {
          sinEtiqueta.push(texto.slice(0, 45))
        }
      }
    }
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i)
    assert.deepEqual(repetidos, [], `ids repetidos: ${repetidos.join(', ')}`)
    assert.deepEqual(sinEtiqueta, [], 'campo sin id, sin label envolvente y sin aria-label')
  })

  test(`${modal}: los campos viven dentro del form`, () => {
    const src = leer(modal)
    const abre = src.indexOf('<form')
    const cierra = src.indexOf('</form>')
    assert.ok(abre >= 0 && cierra > abre, 'el modal tiene que tener un <form>')
    const primero = src.search(/<(?:input|select|textarea)\b/)
    const ultimo = Math.max(
      src.lastIndexOf('<input'),
      src.lastIndexOf('<select'),
      src.lastIndexOf('<textarea')
    )
    assert.ok(
      primero > abre && ultimo < cierra,
      'un campo fuera del form no se envía nunca: todos tienen que estar adentro'
    )
  })

  test(`${modal}: el alto y el pie resisten el teclado abierto (T14)`, () => {
    const css = leerCss(modal)
    assert.match(css, /max-height:\s*90dvh/, 'sin dvh la barra fija queda detrás del teclado')
    assert.match(css, /max-height:\s*90vh/, 'el vh tiene que quedar como fallback')
    assert.ok(
      !/env\(safe-area-inset-bottom\)/.test(css),
      'env() necesita el fallback , 0px o se pierde todo el padding'
    )
    assert.match(css, /-webkit-overflow-scrolling:\s*touch/, 'falta la inercia del scroll en el modal')
    assert.match(css, /margin-inline:\s*-20px/, 'el borde del pie tiene que ir de lado a lado')
  })
}
