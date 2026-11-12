// tests/presupuestos/cartel-disponible-sin-50-30-20.test.js
//
//   node --test tests/presupuestos/cartel-disponible-sin-50-30-20.test.js
//
// S12 (odd/tasks/bugs-ronda-10-presupuesto.md), literal del dueño: "acá la explicación
// incluso es confusa. La explicación introduce el concepto de 50-30-20 [...] ¿qué tiene
// que ver esa definición con el cálculo de lo supuesto disponible en modo libertad?"
//
// El globo del header del disponible explicaba LA PROYECCIÓN (otro número, el de
// fn_reporte_proyeccion_presupuestaria) con los porcentajes de distribución, mientras al
// lado se mostraba la liquidez. Ahora el globo explica su propio número.
//
// Texto aprobado por el dueño, palabra por palabra:
//   "Es lo que tienes en tus billeteras menos lo que ya asignaste a las categorías menos
//    las cuotas de tarjetas que vencen dentro de este ciclo."

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pagina = fs.readFileSync('src/pages/Presupuestos/PresupuestosPage.tsx', 'utf-8')
const dic = (lang) => fs.readFileSync(`src/locales/${lang}.ts`, 'utf-8')

const TEXTO_ES =
  'Es lo que tienes en tus billeteras menos lo que ya asignaste a las categorías menos las cuotas de tarjetas que vencen dentro de este ciclo.'

test('el globo del disponible explica su propio número, sin porcentajes', () => {
  const i = pagina.indexOf('disponible-label')
  assert.ok(i > -1, 'falta el label del disponible')
  const bloque = pagina.slice(i, i + 900)
  assert.ok(
    bloque.includes("t('budget_info_disponible')"),
    'el globo tiene que usar la clave del disponible',
  )
  assert.ok(
    !bloque.includes('pct_nec'),
    'el globo no puede pasar porcentajes de distribución: el número no los usa',
  )
  assert.ok(
    !bloque.includes("t('budget_info_proyeccion')"),
    'el globo no puede explicar la proyección al lado de la liquidez',
  )
})

test('el texto del español es el que aprobó el dueño, literal', () => {
  assert.ok(dic('es').includes(TEXTO_ES), 'el texto del disponible cambió respecto del aprobado')
})

test('el globo existe en los tres idiomas y ninguno menciona la regla de distribución', () => {
  for (const lang of ['es', 'en', 'pt']) {
    const m = dic(lang).match(/budget_info_disponible:\s*"([^"]*)"/)
    assert.ok(m, `falta budget_info_disponible en ${lang}.ts`)
    assert.ok(!/50|30-20|distribution rule|regra de distribuição/i.test(m[1]),
      `${lang}.ts no puede mencionar la regra de distribución en este globo`)
  }
})
