// tests/presupuestos/disponible-en-monto-manual.test.js
//
//   node --test tests/presupuestos/disponible-en-monto-manual.test.js
//
// S4 (odd/tasks/bugs-ronda-10-presupuesto.md), literal del dueño: "Si voy a ingresar un
// monto manual en alguna categoría, pierdo de pantalla lo disponible que quedó atrás
// oculto. O acomodamos mejor la ventana [...] O ponemos alguna indicación en ese modal
// que nos diga cuánto había disponible para asignar."
//
// Se eligió la indicación adentro del modal: acomodar la ventana no alcanza porque el
// teclado numérico tapa el hero de la pantalla. Lo que se ata acá es que el dato exista
// en ese bloque y que no invente un cero cuando el saldo todavía no se conoce.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pagina = fs.readFileSync('src/pages/Presupuestos/PresupuestosPage.tsx', 'utf-8')
const css = fs.readFileSync('src/pages/Presupuestos/Presupuestos.css', 'utf-8')

test('el modal de monto manual muestra cuánto hay disponible para asignar', () => {
  const bloque = pagina.slice(pagina.indexOf('asignar-monto-disponible'))
  assert.ok(bloque.length > 0, 'falta el bloque que muestra el disponible')
  assert.ok(
    bloque.includes("t('hero_disponible_para_asignar')"),
    'la etiqueta tiene que ser la que ya usa el hero, no una nueva',
  )
  assert.ok(
    bloque.slice(0, 400).includes('{formatMonto(saldoAsignar)}'),
    'el número tiene que ser el saldo a asignar formateado',
  )
})

test('sin saldo conocido no se dibuja nada: un cero sería un dato falso', () => {
  const antes = pagina.slice(0, pagina.indexOf('asignar-monto-disponible'))
  assert.ok(
    antes.lastIndexOf('saldoAsignar !== null') > -1,
    'el bloque va detrás de la guarda de saldo conocido',
  )
})

test('el bloque tiene su propia regla de estilo', () => {
  assert.match(css, /\.asignar-monto-disponible\s*\{/, 'falta la regla .asignar-monto-disponible')
})
