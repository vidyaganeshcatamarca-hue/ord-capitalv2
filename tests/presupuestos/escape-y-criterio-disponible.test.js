// tests/presupuestos/escape-y-criterio-disponible.test.js
//
//   node --test tests/presupuestos/escape-y-criterio-disponible.test.js
//
// Ronda de auditoría, dos hallazgos del informe del dueño.
//
// F-06 (bajo, ya era la deuda D-31 del PRD): «con el panel "Detalle del sobre"
// abierto, Escape deja el overlay en 1 y el título igual; la X y el click en el
// fondo sí cierran». El dueño pidió arreglarlo.
//
// F-08 (bajo, "spec_question"): tres criterios de "disponible" conviviendo.
// `sobresConDisponible` filtraba por `monto_disponible` crudo mientras «Llenar
// Hueco», la validación de transferencia y la fila del sobre usaban el criterio
// dual por modo. El dueño pidió unificarlo.
//
// Lo que se congela:
//   1. Escape cierra las cuatro capas de esta pantalla.
//   2. El disponible de un sobre se calcula en un solo lugar.

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

test('Escape cierra las cuatro capas de la pantalla', () => {
  assert.match(pagina, /addEventListener\('keydown'/, 'no hay listener de teclado')
  // El cuerpo del handler va ANTES del addEventListener, así que el recorte arranca
  // en el handler, no en el registro del listener.
  const desde = pagina.indexOf('const alPresionar')
  assert.ok(desde > -1, 'no encontré el handler de Escape')
  const bloque = pagina.slice(desde, pagina.indexOf("removeEventListener('keydown'"))
  for (const capa of ['setShowBaseCeroModal(false)', 'setShowTransferirModal(false)', 'setShowAsignarSheet(false)', 'setShowDetalleSheet(false)']) {
    assert.ok(bloque.includes(capa), `Escape no cierra ${capa}`)
  }
  assert.match(pagina, /removeEventListener\('keydown'/, 'el listener tiene que limpiarse al desmontar')
})

test('el disponible del sobre se calcula en un solo lugar', () => {
  assert.match(pagina, /function disponibleDeSobre\(/, 'falta el helper del criterio único')
  const usos = pagina.match(/disponibleDeSobre\(/g) || []
  assert.equal(usos.length, 5, `se esperan 1 definición y 4 usos, hay ${usos.length}`)
})

test('la lista de orígenes ya no filtra por el monto_disponible crudo', () => {
  const idx = pagina.indexOf('const sobresConDisponible')
  assert.ok(idx > -1, 'no encontré la lista de orígenes')
  const bloque = pagina.slice(idx, idx + 300)
  assert.doesNotMatch(bloque, /s\.monto_disponible > 0/,
    'la lista de orígenes volvió al criterio crudo que la auditoría marcó')
  assert.match(bloque, /disponibleDeSobre\(s, config\?\.modo_presupuesto\) > 0/,
    'la lista de orígenes tiene que usar el criterio único')
})
