// tests/presupuestos/solo-lectura-ciclos-pasados.test.js
//
//   node --test tests/presupuestos/solo-lectura-ciclos-pasados.test.js
//
// Ronda 8 (dueño): "El ciclo anterior y el doble anterior, tanto en base cero como
// en modo libertad, es solo lectura. No puedo hacer asignaciones de ciclos
// anteriores."
//
// En la captura del dueño, estando en "Ciclo Anterior", la app ofrecía los botones
// "Cubrir déficit" y "Asignar", y encima mostraba un "Disponible para asignar" que
// mezclaba la liquidez de HOY con los sobres de un ciclo ya cerrado.
//
// Lo que se congela:
//   1. `soloLectura` sale de comparar el ciclo elegido con el ciclo activo (el que
//      depende del día ancla), y vale para los dos modos de presupuesto.
//   2. Todo lo que escribe tiene guarda: abrir asignación, asignar, llenar hueco,
//      monto manual, transferir y cubrir déficit por la vía directa.
//   3. La UI no dibuja el botón Asignar de cada sobre, ni el Cubrir déficit de la
//      alerta, ni el CTA de activar disciplina, ni un número en el encabezado.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadDictionary } from '../i18n/support/i18n-harness.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const leer = (...partes) => fs.readFileSync(path.join(repo, ...partes), 'utf8')

const pagina = leer('src/pages/Presupuestos/PresupuestosPage.tsx')
const css = leer('src/pages/Presupuestos/Presupuestos.css')

/** El cuerpo de una función del componente, desde su firma hasta el cierre. */
function cuerpoDe(firma) {
  const inicio = pagina.indexOf(firma)
  assert.ok(inicio > -1, `no se encontró ${firma}`)
  return pagina.slice(inicio, inicio + 1400)
}

test('soloLectura sale del ciclo elegido contra el ciclo activo', () => {
  assert.match(pagina, /const esCicloActivo = mesOffset === activeOffset/)
  assert.match(pagina, /const soloLectura = !esCicloActivo/)
  // El modo no participa: aplica a base cero y a libertad por igual.
  assert.doesNotMatch(
    pagina,
    /const soloLectura = [^\n]*modo_presupuesto/,
    'el solo lectura no puede depender del modo de presupuesto',
  )
})

test('cada camino que escribe tiene su guarda', () => {
  const guardas = [
    'const handleAbrirAsignar = ',
    'const ejecutarAsignacion = ',
    'const handleLlenarHueco = ',
    'const handleMontoManualConfirmar = ',
    'const handleTransferir = ',
    'const handleAbrirTransferenciaDirecta = ',
  ]
  for (const firma of guardas) {
    const cuerpo = cuerpoDe(firma)
    assert.match(cuerpo, /soloLectura/, `${firma} tiene que mirar soloLectura`)
  }
})

test('el botón Asignar de cada sobre no se dibuja en un ciclo cerrado', () => {
  assert.match(pagina, /interface GrupoProps \{[\s\S]*?soloLectura\?: boolean/)
  assert.match(pagina, /interface FilaSobreProps \{[\s\S]*?soloLectura\?: boolean/)
  assert.match(pagina, /function FilaSobre\(\{[^}]*soloLectura/)
  assert.match(
    pagina,
    /\{!soloLectura && \(\s*<button className="sobre-btn-asignar"/,
    'el botón Asignar va dentro del gate',
  )
  // El margen derecho existía para dejar lugar al botón: sin botón, sin margen.
  assert.match(pagina, /marginRight: soloLectura \? 0 : 80/)
})

test('la alerta de sobres excedidos pierde la acción de cubrir déficit', () => {
  assert.match(
    pagina,
    /\{!soloLectura && \(\s*<button\s+type="button"\s+className="btn-cubrir-deficit"/,
    'Cubrir déficit es una asignación: no se ofrece en un ciclo cerrado',
  )
  assert.match(pagina, /budget_exceeded_envelopes_desc_readonly/, 'y el texto deja de invitar a cubrirlo')
})

test('el encabezado no muestra un disponible que no existe', () => {
  assert.match(pagina, /soloLectura \? t\('budget_cycle_closed_label'\)/)
  assert.match(pagina, /soloLectura \? '—' : saldoAsignar !== null/)
  assert.match(pagina, /soloLectura \? t\('budget_cycle_closed_desc'\)/)
  // El CTA de activar disciplina es una acción de configuración del ciclo vivo.
  assert.match(pagina, /\{!soloLectura && config\?\.modo_presupuesto === 'anticipado' && \(/)
  assert.match(css, /\.disponible-header\.estado-cerrado \.disponible-monto \{ color: var\(--text-3\); \}/)
})

test('las claves del modo solo lectura están publicadas en los tres idiomas', async () => {
  const claves = [
    'budget_readonly_cycle_toast',
    'budget_cycle_closed_label',
    'budget_cycle_closed_desc',
    'budget_exceeded_envelopes_desc_readonly',
  ]
  for (const lang of ['es', 'en', 'pt']) {
    const dict = await loadDictionary(lang)
    const planas = new Set(
      Object.values(dict)
        .filter((seccion) => seccion && typeof seccion === 'object')
        .flatMap((seccion) => Object.keys(seccion)),
    )
    for (const clave of claves) assert.ok(planas.has(clave), `${lang}.ts no publica ${clave}`)
  }
})
