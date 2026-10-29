// tests/presupuestos/presupuestos-ui.test.js
//
//   node --test tests/presupuestos/presupuestos-ui.test.js
//
// S3 y S4 (ronda 7, dueño): "hay errores de claves no publicadas, entre otras
// cosas" y "texto de una sugerencia en color amarillo, ilesible para el modo
// claro, tiene que ser en negro".
//
// Las claves: la pantalla ya llamaba a t() con claves que no existían en ningún
// diccionario, así que el usuario leía `budget_exceeded_envelopes_title` en vez
// del título. La red es un barrido del módulo, no una lista de las ocho que
// fallaban: si mañana alguien agrega una clave nueva y se olvida de publicarla,
// este test la nombra.
//
// El color: en modo claro el texto era #FFE66D fijo, un amarillo pensado para
// fondo oscuro. Se congela que el color salga de la tinta del tema.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadDictionary } from '../i18n/support/i18n-harness.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const leer = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

/** Los archivos de la pantalla de Presupuestos (no los sobres: otro módulo). */
const ARCHIVOS = [
  'src/pages/Presupuestos/PresupuestosPage.tsx',
  'src/pages/Presupuestos/CuposResumenCard.tsx',
]

/** Todas las claves de un diccionario, planas (el traductor busca plano primero). */
function clavesPlanas(dict) {
  const out = new Set()
  for (const seccion of Object.values(dict)) {
    if (!seccion || typeof seccion !== 'object') continue
    for (const clave of Object.keys(seccion)) out.add(clave)
  }
  return out
}

/** Las claves que los archivos del módulo piden con t('...'). */
function clavesUsadas() {
  const usadas = new Map()
  for (const rel of ARCHIVOS) {
    const src = leer(rel)
    const re = /\bt\(\s*['"`]([^'"`]+)['"`]/g
    let m
    while ((m = re.exec(src)) !== null) {
      const clave = m[1]
      const linea = src.slice(0, m.index).split('\n').length
      if (!usadas.has(clave)) usadas.set(clave, `${rel}:${linea}`)
    }
  }
  return usadas
}

const diccionarios = {
  es: clavesPlanas(await loadDictionary('es')),
  en: clavesPlanas(await loadDictionary('en')),
  pt: clavesPlanas(await loadDictionary('pt')),
}

test('cada clave que pide la pantalla de Presupuestos está publicada en los tres idiomas', () => {
  const usadas = clavesUsadas()
  assert.ok(usadas.size > 50, 'el barrido debería encontrar las claves de la pantalla')

  const faltantes = []
  for (const [clave, donde] of usadas) {
    for (const [lang, claves] of Object.entries(diccionarios)) {
      if (!claves.has(clave)) faltantes.push(`${lang}: ${clave}  (${donde})`)
    }
  }

  assert.deepEqual(
    faltantes,
    [],
    `Claves que la UI muestra crudas porque no están publicadas:\n${faltantes.join('\n')}`,
  )
})

test('las claves del bloque de sobres excedidos existen con el texto esperado', () => {
  // Estas cuatro se veían crudas en la captura del dueño: se nombran para que
  // un borrado accidental no las saque en silencio.
  for (const clave of [
    'budget_exceeded_envelopes_title',
    'budget_exceeded_envelopes_desc',
    'btn_cubrir_deficit',
    'btn_configure_later',
    'budget_btn_activating',
    'budget_btn_confirm_and_assign',
    'budget_error_insufficient_funds',
    'error_base_cero_locked',
  ]) {
    for (const [lang, claves] of Object.entries(diccionarios)) {
      assert.ok(claves.has(clave), `${lang}.ts no publica ${clave}`)
    }
  }
})

test('la sugerencia del modal es legible en modo claro: usa la tinta del tema', () => {
  const css = leer('src/pages/Presupuestos/Presupuestos.css')

  const bloque = css.match(/\.disclaimer-tip\s*\{[\s\S]*?\}/)
  assert.ok(bloque, 'la hoja de la pantalla debería declarar .disclaimer-tip')

  assert.match(
    bloque[0],
    /color:\s*var\(--text\)/,
    'el texto de la sugerencia tiene que salir de --text (negro en modo claro)',
  )
  assert.doesNotMatch(
    bloque[0],
    /color:\s*#FFE66D/i,
    'el amarillo fijo de tema oscuro no puede volver: es ilegible en modo claro',
  )
})
