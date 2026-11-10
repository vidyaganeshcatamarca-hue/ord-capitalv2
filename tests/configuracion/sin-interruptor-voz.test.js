// tests/configuracion/sin-interruptor-voz.test.js
//
//   node --test tests/configuracion/sin-interruptor-voz.test.js
//
// Dueño (2026-11-02): "en el menú de ajustes, preferencias / carga y registro, ahí
// tenemos al final una opción de automatización carga por voz prendido apagado como es
// una funcionalidad que está por defecto en todos los sistemas vamos a quitar esa opción
// desde el menú [...] va a quedar siempre atendida por defecto".
//
// Medido en la base viva antes de tocar nada: app_feature_flags.menu_carga_voz está en
// modo_minimo 'simple', pref_key null, activo true, y 0 de 83 usuarios tienen
// voz_activada en false. O sea el interruptor no gateaba nada: la voz ya está siempre
// disponible y sacarlo no requiere SQL ni migrar datos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const leer = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8')

const prefs = leer('src', 'pages', 'Configuracion', 'PreferenciasOperativasPage.tsx')
const app = leer('src', 'App.tsx')

test('el interruptor de voz ya no esta en preferencias', () => {
  assert.ok(!prefs.includes('config_voice_enabled'), 'el texto del interruptor sigue en la pagina')
  assert.ok(!prefs.includes('config_voice_enabled_desc'), 'la descripcion del interruptor sigue en la pagina')
  assert.ok(!prefs.includes('<ToggleSwitch'), 'el control sigue dibujado en la pagina')
  // La preferencia sigue viva en los datos (tipo, default y payload del RPC): lo que
  // desaparecio es el control que la editaba. Si alguien corta el payload, se rompe el
  // guardado del resto de las preferencias.
  assert.match(
    prefs,
    /p_voz_activada: newPrefs\.voz_activada/,
    'se corto el guardado de preferencias en vez de solo el control',
  )
})

test('la seccion Automatizacion no queda vacia en pantalla', () => {
  assert.ok(!prefs.includes('config_automation_section'), 'queda el titulo de una seccion sin contenido')
})

test('queda escrito por que no vuelve', () => {
  assert.match(prefs, /no user switch|no hay interruptor|always on|siempre activ/i, 'falta la nota que impide reintroducirlo')
})

test('sin debilitar la voz: el flag sigue habilitando la grabacion', () => {
  assert.match(app, /hasFeature\('menu_carga_voz'\)/)
})
