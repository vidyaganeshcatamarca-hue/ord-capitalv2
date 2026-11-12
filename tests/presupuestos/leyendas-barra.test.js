// tests/presupuestos/leyendas-barra.test.js
//
//   node --test tests/presupuestos/leyendas-barra.test.js
//
// M2c: la misma barra codifica DOS escalas. El relleno mide el avance sobre la cuota y la
// franja azul mide cuánto del pozo del padre consumió esa fila. Sin leyenda, el número del
// title decía un porcentaje sin decir de qué, y dos hijos podían sumar más de 100% del
// pozo sin que nada lo explicara.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pagina = fs.readFileSync('src/pages/Presupuestos/PresupuestosPage.tsx', 'utf-8')
const dic = (lang) => fs.readFileSync(`src/locales/${lang}.ts`, 'utf-8')

test('cada escala de la barra lleva su leyenda', () => {
  assert.ok(
    pagina.includes("title={`${t('budget_bar_quota')}: ${avance ?? pct}%`}"),
    'el relleno tiene que decir que el porcentaje es sobre la cuota',
  )
  assert.ok(
    pagina.includes("title={`${t('budget_bar_pot')}: ${pctPozo}%`}"),
    'la franja azul tiene que decir que el porcentaje es del pozo del padre',
  )
})

test('ya no queda un porcentaje suelto como única explicación', () => {
  assert.ok(!pagina.includes('title={`${pctPozo}%`}'), 'el title pelado del azul tiene que estar reemplazado')
})

test('las dos leyendas existen en los tres idiomas', () => {
  for (const lang of ['es', 'en', 'pt']) {
    for (const clave of ['budget_bar_quota', 'budget_bar_pot']) {
      assert.ok(dic(lang).includes(`${clave}:`), `falta ${clave} en ${lang}.ts`)
    }
  }
})
