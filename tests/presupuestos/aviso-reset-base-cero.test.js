// tests/presupuestos/aviso-reset-base-cero.test.js
//
//   node --test tests/presupuestos/aviso-reset-base-cero.test.js
//
// Ronda de auditoría, F-04 (probable). El informe:
//
//   «con "Educación" en 150.050 GBP y "Bebidas" en 100 GBP, activar base cero con
//    "Configurar después" … ambas quedan en 0 GBP, sin diálogo que lo anuncie …
//    Mientras que la entrada a Base Cero no avisa nada.»
//
// La causa es la tanda B3: `fn_configurar_modo_presupuesto` archiva y pone en cero
// las asignaciones del ciclo al cambiar de modo. La salida a Modo Libertad ya lo
// avisaba; la entrada no. El dueño pidió arreglarlo.
//
// Lo que se congela:
//   1. El paso 1 del contrato muestra el aviso, con clave i18n (nada hardcodeado).
//   2. La clave existe en los tres diccionarios (el test de paridad i18n ya lo
//      cubre; acá se fija que además la pantalla la use).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const pagina = fs.readFileSync(
  path.join(repo, 'src', 'pages', 'Presupuestos', 'PresupuestosPage.tsx'),
  'utf8'
)
const css = fs.readFileSync(path.join(repo, 'src', 'pages', 'Presupuestos', 'Presupuestos.css'), 'utf8')

test('el modal de activación avisa que las asignaciones se reinician', () => {
  const desde = pagina.indexOf('{showBaseCeroModal && (')
  assert.ok(desde > -1, 'no encontré el modal de activación')
  const hasta = pagina.indexOf('MODAL: ', desde)
  const bloque = pagina.slice(desde, hasta > -1 ? hasta : desde + 6000)
  assert.match(bloque, /t\('budget_base_cero_reset_notice'\)/,
    'el modal tiene que mostrar el aviso con su clave i18n')
  assert.match(bloque, /contrato-aviso-reset/, 'el aviso tiene que tener su clase para el estilo')
  assert.doesNotMatch(bloque, /las asignaciones de este ciclo se reinician:/,
    'el texto no puede estar hardcodeado en el componente')
})

test('la clave existe en los tres idiomas', () => {
  for (const lang of ['es', 'en', 'pt']) {
    const dic = fs.readFileSync(path.join(repo, 'src', 'locales', `${lang}.ts`), 'utf8')
    assert.match(dic, /budget_base_cero_reset_notice:/, `falta la clave en ${lang}`)
  }
})

test('el aviso tiene estilo propio, sin colores fijos', () => {
  assert.match(css, /\.contrato-aviso-reset\s*\{/, 'falta el estilo del aviso')
  const bloque = css.slice(css.indexOf('.contrato-aviso-reset {'))
  assert.match(bloque.slice(0, 400), /var\(--/, 'el estilo tiene que usar tokens del tema')
})
