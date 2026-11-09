// tests/conexion-badge.test.js
//
//   node --test tests/conexion-badge.test.js
//
// Dueño (2026-11-02): "el mensaje de datos sincronizados [...] pareciera hardcodeado.
// La aplicación no detecta que no se puede comunicar con la base [...] tendrá que estar
// en rojo avisando de que no hay conexión".
//
// El cartel del Home tenía el punto verde y el texto fijos: sin red seguía afirmando que
// los datos estaban sincronizados mientras la pantalla mostraba $0.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { syncBadge } from '../src/lib/connection.ts'

test('con red el cartel afirma sincronizado en verde', () => {
  assert.deepEqual(syncBadge(true), { dot: 'dot-green', key: 'hero_sync_ok' })
})

test('sin red el cartel avisa en rojo', () => {
  assert.deepEqual(syncBadge(false), { dot: 'dot-red', key: 'hero_sync_offline' })
})

test('el texto de sin conexión existe en los tres idiomas', () => {
  for (const archivo of ['es.ts', 'en.ts', 'pt.ts']) {
    const texto = fs.readFileSync(`src/locales/${archivo}`, 'utf8')
    assert.match(texto, /hero_sync_offline:/, `falta hero_sync_offline en ${archivo}`)
  }
})

test('el Home deja de hardcodear el verde', () => {
  const home = fs.readFileSync('src/pages/Home/HomePage.tsx', 'utf8')
  assert.match(home, /syncBadge\(/, 'el Home no usa el criterio de conexion')
  assert.ok(
    !/className="dot dot-green" \/>\s*<span className="text-xs text-muted">\{t\('hero_sync_ok'\)\}/.test(home),
    'el cartel sigue hardcodeado en verde con el texto de sincronizado',
  )
})
