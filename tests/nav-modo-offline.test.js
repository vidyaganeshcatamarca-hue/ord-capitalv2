// tests/nav-modo-offline.test.js
//
//   node --test tests/nav-modo-offline.test.js
//
// Dueño (2026-11-02): "al volver del modo avión [...] debería aparecer base cero en
// tercera opción, pero se ha puesto el módulo tarjetas [...] Luego cerré, volví a abrir
// la app y lo corrigió".
//
// La barra arrancaba en 'anticipado' y aprendía el modo real de una RPC; sin red la RPC
// falla y la barra se queda con la etiqueta equivocada para un usuario en base cero.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { initialModo } from '../src/lib/modoPresupuesto.ts'

test('sin red, si la ultima vez fue base cero, sigue siendo base cero', () => {
  assert.equal(initialModo('base_cero'), 'base_cero')
})

test('anticipado se respeta', () => {
  assert.equal(initialModo('anticipado'), 'anticipado')
})

test('sin nada guardado cae al default de la app', () => {
  assert.equal(initialModo(null), 'anticipado')
  assert.equal(initialModo('basura'), 'anticipado')
})

test('la barra arranca desde el cache y lo actualiza al leer la config', () => {
  const nav = fs.readFileSync('src/components/BottomNav/BottomNav.tsx', 'utf8')
  assert.match(nav, /readModoPresupuesto/, 'la barra no arranca desde el modo guardado')
  assert.match(nav, /writeModoPresupuesto/, 'la barra no guarda el modo que lee del servidor')
  assert.ok(
    !/useState<'base_cero' \| 'anticipado'>\('anticipado'\)/.test(nav),
    'la barra sigue clavando anticipado como estado inicial',
  )
})
