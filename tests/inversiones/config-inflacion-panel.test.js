// tests/inversiones/config-inflacion-panel.test.js
//
//   node --test tests/inversiones/config-inflacion-panel.test.js
//
// S2 del dueño (2026-10-23, verbatim): "La primera vez que entras a la pestaña de
// inflación aparece el botón guardar, pero no se ha hecho ningún cambio en la
// fuente de inflación. [...] el botón guardar solo aparece cuando hay cambios en
// la fuente."
//
// S5 (verbatim): "Apenas cambio la fuente de la configuración de la inflación,
// abajo no refresca el cambio después que le doy a grabar [...] Debes refrescar la
// fuente una vez grabada".
//
// S7 (verbatim): "el ejemplo está escrito con un color muy fuerte, por lo tanto
// parece una celda ya escrita. [...] poner un color super suave, que se vea, pero un
// gris mucho más clarito".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const { hayCambiosInflacion } = await import('../../src/lib/inflacionDirty.ts')

const sinGuardar = { pais: null, fuente: 'proxy_dolar', valorManual: null }

test('sin config guardada y con el default, no hay cambios (S2)', () => {
  assert.equal(
    hayCambiosInflacion(
      { pais: 'AR', fuente: 'proxy_dolar', valorManual: '' },
      sinGuardar
    ),
    false,
    'el proxy dólar es el default: entrar a la pestaña no es un cambio'
  )
})

test('cambiar la fuente sí es un cambio', () => {
  assert.equal(
    hayCambiosInflacion(
      { pais: 'AR', fuente: 'manual', valorManual: '' },
      sinGuardar
    ),
    true
  )
})

test('manual sin valor guardado: es cambio recién cuando hay un valor válido', () => {
  const guardado = { pais: 'AR', fuente: 'manual', valorManual: null }
  assert.equal(
    hayCambiosInflacion({ pais: 'AR', fuente: 'manual', valorManual: '' }, guardado),
    false,
    'sin valor tipeado y sin valor guardado no hay nada que guardar'
  )
  assert.equal(
    hayCambiosInflacion({ pais: 'AR', fuente: 'manual', valorManual: '35' }, guardado),
    true
  )
})

test('mismo valor manual que el guardado no es un cambio', () => {
  const guardado = { pais: 'AR', fuente: 'manual', valorManual: 35 }
  assert.equal(
    hayCambiosInflacion({ pais: 'AR', fuente: 'manual', valorManual: '35' }, guardado),
    false
  )
  assert.equal(
    hayCambiosInflacion({ pais: 'AR', fuente: 'manual', valorManual: '35.00' }, guardado),
    false
  )
  assert.equal(
    hayCambiosInflacion({ pais: 'AR', fuente: 'manual', valorManual: '36' }, guardado),
    true
  )
})

test('cambiar de país es un cambio', () => {
  const guardado = { pais: 'AR', fuente: 'proxy_dolar', valorManual: null }
  assert.equal(
    hayCambiosInflacion({ pais: 'UY', fuente: 'proxy_dolar', valorManual: '' }, guardado),
    true
  )
})

test('el componente refresca la fuente después de guardar (S5)', () => {
  const src = read('src/components/inversiones/ConfigInflacionView.tsx')
  assert.ok(
    /await\s+cargarConfig\(\)/.test(src),
    'tras guardar hay que volver a leer el RPC para que el bloque de abajo se actualice'
  )
  const submit = src.slice(src.indexOf('const handleSubmit'))
  const finHandler = submit.indexOf('const rootClass')
  const cuerpo = submit.slice(0, finHandler > 0 ? finHandler : undefined)
  assert.ok(
    cuerpo.indexOf('fn_configurar_inflacion') < cuerpo.indexOf('cargarConfig'),
    'el refresco va después del guardado, no antes'
  )
})

test('el ejemplo del input manual se ve como ejemplo, no como texto cargado (S7)', () => {
  const css = read('src/components/inversiones/ConfigInflacionView.css')
  const match = css.match(/\.config-inflacion-field input::placeholder\s*\{([^}]*)\}/)
  assert.ok(match, 'falta la regla del placeholder del input manual')
  const body = match[1]
  const opacity = body.match(/opacity:\s*([\d.]+)/)
  assert.ok(opacity, 'el placeholder necesita opacidad propia para no parecer texto')
  assert.ok(
    Number(opacity[1]) <= 0.35,
    `el placeholder tiene que ser mucho más claro que el texto (opacidad ${opacity[1]})`
  )
  assert.match(body, /font-weight:\s*(400|normal)/, 'y más liviano que el valor real')
})
