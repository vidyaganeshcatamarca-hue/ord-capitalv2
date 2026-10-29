// tests/settingsModeSwitch.test.js
//
//   node --test tests/settingsModeSwitch.test.js
//
// S10 (ronda 7, dueño): "al volver del modo avanzado al modo simple, pasa sin
// ninguna confirmación previa. Deberíamos poner un modal de confirmación, ¿está
// seguro que desea volver al modo simple?, para que evitemos los errores de
// vuelta al modo simple por error de mala digitación".
//
// Antes el interruptor era asimétrico: entrar al avanzado abría el ConfirmModal
// y volver al simple ejecutaba `desactivarModoAvanzado()` en el mismo toque. Lo
// que se congela acá: el toque NUNCA cambia el modo, solo abre la confirmación,
// en las dos direcciones; el cambio ocurre únicamente dentro del onConfirm.
//
// Es análisis del fuente, como el resto de los tests de UI de este repo: el
// archivo no se puede importar en Node porque arrastra React y los alias de
// Vite.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadDictionary } from './i18n/support/i18n-harness.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..')

const hub = fs.readFileSync(
  path.join(repo, 'src/components/configuracion/ConfiguracionHub.tsx'),
  'utf-8',
)

/** El cuerpo de ModeSwitchRow, que es el interruptor Simple/Avanzado. */
function modeSwitchRow() {
  const start = hub.indexOf('function ModeSwitchRow')
  assert.ok(start > 0, 'ConfiguracionHub debe declarar ModeSwitchRow')
  const end = hub.indexOf('\nfunction ', start + 1)
  return hub.slice(start, end === -1 ? undefined : end)
}

test('el toque en el interruptor solo abre la confirmación', () => {
  const row = modeSwitchRow()

  assert.match(
    row,
    /onClick=\{\(\) => setConfirming\(true\)\}/,
    'el onClick tiene que abrir la confirmación, sin ramas que cambien el modo',
  )
  // La rama vieja: volver a simple ejecutaba el cambio en el mismo toque.
  assert.doesNotMatch(
    row,
    /onClick=\{\(\) => \{[\s\S]*?desactivarModoAvanzado\(\)/,
    'el onClick no puede cambiar el modo',
  )
})

test('el cambio de modo vive únicamente dentro del onConfirm', () => {
  const row = modeSwitchRow()
  const onConfirm = row.slice(row.indexOf('onConfirm={'))
  const cuerpoConfirm = onConfirm.slice(0, onConfirm.indexOf('onCancel={'))

  assert.match(cuerpoConfirm, /activarModoAvanzado\(\)/, 'confirmar tiene que activar el avanzado')
  assert.match(cuerpoConfirm, /desactivarModoAvanzado\(\)/, 'confirmar tiene que volver al simple')
  assert.match(cuerpoConfirm, /setConfirming\(false\)/, 'confirmar cierra el modal')

  // Fuera del onConfirm no puede haber llamadas al cambio de modo.
  const sinConfirm = row.replace(cuerpoConfirm, '')
  assert.doesNotMatch(
    sinConfirm,
    /(des)?activarModoAvanzado\(\)/,
    'ninguna otra parte del interruptor cambia el modo',
  )
})

test('la confirmación se renderiza en las dos direcciones', () => {
  const row = modeSwitchRow()

  // Antes el modal estaba envuelto en `{goAdvanced && (...)}`, así que volver a
  // simple no lo montaba nunca.
  assert.doesNotMatch(
    row,
    /goAdvanced\s*&&\s*\(?\s*<ConfirmModal/,
    'el ConfirmModal no puede estar condicionado a ir hacia el avanzado',
  )
  assert.match(row, /<ConfirmModal/, 'el interruptor tiene que montar el ConfirmModal')
})

test('cada dirección usa su propio texto de confirmación', () => {
  const row = modeSwitchRow()

  for (const clave of [
    'settings_confirm_go_advanced_title',
    'settings_confirm_go_advanced_message',
    'settings_confirm_go_advanced_confirm',
    'settings_confirm_back_to_simple_title',
    'settings_confirm_back_to_simple_message',
    'settings_confirm_back_to_simple_confirm',
  ]) {
    assert.match(row, new RegExp(`'${clave}'`), `el interruptor debería usar ${clave}`)
  }
})

test('las claves de las dos confirmaciones están publicadas en los tres idiomas', async () => {
  const claves = [
    'settings_confirm_go_advanced_title',
    'settings_confirm_go_advanced_message',
    'settings_confirm_go_advanced_confirm',
    'settings_confirm_back_to_simple_title',
    'settings_confirm_back_to_simple_message',
    'settings_confirm_back_to_simple_confirm',
    'btn_cancel',
  ]

  for (const lang of ['es', 'en', 'pt']) {
    const dict = await loadDictionary(lang)
    const planas = new Set(
      Object.values(dict)
        .filter((seccion) => seccion && typeof seccion === 'object')
        .flatMap((seccion) => Object.keys(seccion)),
    )
    for (const clave of claves) {
      assert.ok(planas.has(clave), `${lang}.ts no publica ${clave}`)
    }
  }
})
