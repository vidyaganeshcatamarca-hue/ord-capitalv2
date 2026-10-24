// tests/budget-detalle-asignacion.test.js
//
//   node --test tests/budget-detalle-asignacion.test.js
//
// S10 del dueño (2026-10-24, verbatim):
//   "las tarjetas que ya tienen asignado un presupuesto no muestran esta
//    información. el comportamiento que quiero es que al tocar las tarjetas que ya
//    tienen asignaciones, me muestre la información que muestran las tarjetas que no
//    tienen asignaciones. Se abre una ventanita con una X de cerrar, donde me
//    muestre esa información como un detalle de lo que fue. Toda la información, lo
//    asignado, lo gastado, lo asignado el último mes, lo gastado el último mes y el
//    promedio de los últimos seis meses. [...] en las categorías con asignaciones,
//    esta información no se muestra en la tarjeta original, sino que se muestra al
//    hacer clic en la tarjeta. Y en las tarjetas que no tienen asignaciones, todavía
//    se muestra esta información tal cual se está haciendo ahora."

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const page = read('src/pages/Presupuestos/PresupuestosPage.tsx')
const sheet = page.slice(page.indexOf('showAsignarSheet && sobreSeleccionado'))

test('el sheet que abre la tarjeta tiene una X de cerrar', () => {
  assert.match(sheet, /asignar-sheet-close/, 'falta el botón de cerrar')
  assert.match(sheet, /aria-label=\{t\('btn_close'\)\}/, 'y su etiqueta accesible')
  const boton = sheet.slice(sheet.indexOf('asignar-sheet-close') - 300, sheet.indexOf('asignar-sheet-close') + 400)
  assert.match(boton, /setShowAsignarSheet\(false\)/, 'la X tiene que cerrar el sheet')
})

test('con asignación, el detalle vive en el modal y no en la tarjeta', () => {
  // El gate está una línea ANTES del className: se corta desde el gate, no desde
  // la clase, o la aserción se queda sin la condición (bug del propio test).
  const desdeGate = sheet.indexOf('Number(sobreSeleccionado.monto_asignado ?? 0) > 0')
  assert.ok(desdeGate > 0, 'falta el gate por asignación')
  const bloque = sheet.slice(desdeGate, sheet.indexOf('asignar-opciones'))
  assert.ok(bloque.includes('asignar-sheet-detalle'), 'el bloque va dentro del modal')
  // Los tres datos históricos que el dueño nombró.
  assert.match(bloque, /budget_prev_month_assigned/, 'asignado del último mes')
  assert.match(bloque, /budget_prev_month_spent/, 'gastado del último mes')
  assert.match(bloque, /budget_prev_month_avg/, 'promedio de los últimos seis meses')
})

test('las tarjetas sin asignación siguen mostrando el resumen en la tarjeta', () => {
  // El bloque original de la tarjeta sigue gateado por monto_asignado === 0.
  const tarjeta = page.slice(0, page.indexOf('function InfoBubble'))
  assert.match(
    tarjeta,
    /Number\(sobre\.monto_asignado \?\? 0\) === 0/,
    'la tarjeta conserva el resumen para las categorías sin asignación'
  )
})

test('el sheet tiene su hoja posicionada para que la X no se escape', () => {
  const css = read('src/pages/Presupuestos/Presupuestos.css')
  assert.match(css, /\.asignar-sheet-close\s*\{[^}]*position:\s*absolute/, 'la X va absoluta')
  assert.match(css, /\.modal-sheet\s*\{[^}]*position:\s*relative/, 'y la hoja tiene que ser su contención')
})

test('la tarjeta entera abre el DETALLE, y el botón abre la asignación (S1)', () => {
  // S1 (ronda 4, dueño): "Cuando toco en una tarjeta me estás abriendo el modal de
  // asignar fondos. Yo lo que quería era que al tocar la tarjeta solo me mostraras la
  // información [...] No quería que me muestres las opciones para ingresar
  // asignaciones".
  //
  // El test anterior de esta misma ronda pedía exactamente lo contrario (la fila
  // llamaba onAsignar) porque el pedido previo del dueño era otro. Se cambia el
  // assertion, no el comportamiento: la fila ahora abre el panel informativo y el
  // botón "+ Asignar" sigue abriendo el sheet con las opciones.
  const fila = page.slice(page.indexOf('className="sobre-fila"'), page.indexOf('className="sobre-fila"') + 900)
  assert.match(fila, /onClick=\{onVerDetalle\}/, 'la fila abre el detalle')
  assert.ok(!/onClick=\{onAsignar\}/.test(fila), 'la fila NO abre las opciones de asignar')
  assert.match(fila, /onClick=\{e => \{ e\.stopPropagation\(\); onAsignar\(\) \}\}/, 'el botón sí abre la asignación')
  assert.match(fila, /role="button"/, 'y la fila se anuncia como control')
  assert.match(fila, /tabIndex=\{0\}/, 'y es alcanzable con el teclado')
  assert.match(fila, /'Enter'/, 'Enter y Espacio lo abren')
  const css = read('src/pages/Presupuestos/Presupuestos.css')
  assert.match(css, /\.sobre-fila\s*\{[^}]*cursor:\s*pointer/, 'y muestra que es tocable')
})

test('el panel de detalle no tiene ningún control para asignar (S1)', () => {
  const detalle = page.slice(
    page.indexOf('showDetalleSheet && sobreSeleccionado'),
    page.indexOf('showAsignarSheet && sobreSeleccionado')
  )
  assert.ok(detalle.length > 0, 'falta el panel de detalle')
  for (const control of ['asignar-opciones', 'handleLlenarHueco', 'ejecutarAsignacion', 'handleAbrirBaseCero', 'budget_assign_btn']) {
    assert.ok(!detalle.includes(control), `el detalle no puede ofrecer ${control}`)
  }
  // S2: la misma información que las tarjetas sin asignación.
  assert.match(detalle, /budget_prev_month_assigned/)
  assert.match(detalle, /budget_prev_month_spent/)
  assert.match(detalle, /budget_prev_month_avg/)
  assert.match(detalle, /budget_stat_progress/)
  // Y con qué cerrarse, como pidió el dueño en la ronda anterior.
  assert.match(detalle, /setShowDetalleSheet\(false\)/)
})
