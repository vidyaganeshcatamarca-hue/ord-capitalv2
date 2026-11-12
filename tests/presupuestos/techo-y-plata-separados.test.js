// tests/presupuestos/techo-y-plata-separados.test.js
//
//   node --test tests/presupuestos/techo-y-plata-separados.test.js
//
// S18 del modelo (odd/tasks/presupuesto-plata-y-techo.md), literal del dueño: "Uno es
// el techo. El techo dice lo que se puede gastar y lo que no. Y otra es la plata. La
// plata dice cuánto se le asignó realmente a esa cuenta categoría. Son dos conceptos
// diferentes."
//
// Antes de esto la fila mostraba un solo número, así que el techo era invisible: se veía
// la plata y no el tope contra el que se mide el avance. Este test ata el contrato a la
// página sin renderizarla: las dos etiquetas existen, y un techo NULL se dibuja como
// guion, porque NULL es "sin techo" y un 0 diría "acá no podés gastar nada".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pagina = fs.readFileSync('src/pages/Presupuestos/PresupuestosPage.tsx', 'utf-8')
const diccionario = (lang) => fs.readFileSync(`src/locales/${lang}.ts`, 'utf-8')

test('la fila muestra la plata y el techo como dos números con su etiqueta', () => {
  assert.ok(pagina.includes("t('budget_stat_assigned')"), 'falta la etiqueta de la plata')
  assert.ok(pagina.includes("t('budget_stat_ceiling')"), 'falta la etiqueta del techo')
})

test('un techo NULL se dibuja como guion y no como cero', () => {
  assert.ok(
    pagina.includes("techo === null || techo === undefined ? '—' : fmt(Number(techo))"),
    'el techo sin valor tiene que leerse como guion',
  )
})

test('la clave del techo existe en los tres diccionarios', () => {
  for (const lang of ['es', 'en', 'pt']) {
    assert.ok(
      diccionario(lang).includes('budget_stat_ceiling:'),
      `falta budget_stat_ceiling en ${lang}.ts`,
    )
  }
})
