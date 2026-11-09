// tests/appLockOffline.test.js
//
//   node --test tests/appLockOffline.test.js
//
// Dueño (2026-11-02): "Me he pasado el teléfono a modo avión y se me ha activado el
// bloqueo por pin, lo cual es incorrecto porque no tengo la configuración de pin
// activada [...] simplemente debe aparecer la aplicación sin conexión, pero no
// bloquearse".
//
// Causa: el lib documenta que un estado DESCONOCIDO del servidor cierra por defecto, y
// eso está bien. Pero una petición SIN RESPUESTA no es un estado desconocido: el catch
// de refreshStatus escribía 'activa' de su puño y alzaba el bloqueo, así que sin red la
// app inventaba un PIN que no existía y no dejaba entrar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { stateAfterStatusError } from '../src/lib/appLock.ts'

test('sin estado previo y sin red no se inventa un PIN', () => {
  const r = stateAfterStatusError(null)
  assert.equal(r.estado, null, 'se sigue inventando un estado')
  assert.equal(r.arm, false, 'se bloquea a un usuario que nunca configuro PIN')
})

test('si el servidor ya dijo que hay PIN, se mantiene cerrado', () => {
  const r = stateAfterStatusError('activa')
  assert.equal(r.estado, 'activa')
  assert.equal(r.arm, true, 'se debilito el cierre por defecto cuando si hay PIN')
})

test('sin PIN configurado no se bloquea', () => {
  const r = stateAfterStatusError('sin_pin')
  assert.equal(r.estado, 'sin_pin')
  assert.equal(r.arm, false)
})

test('en cooldown sigue cerrado', () => {
  const r = stateAfterStatusError('en_cooldown')
  assert.equal(r.estado, 'en_cooldown')
  assert.equal(r.arm, true)
})

test('el contexto usa el criterio en vez de hardcodear activa', () => {
  const ctx = fs.readFileSync('src/contexts/AppLockContext.tsx', 'utf8')
  assert.ok(!ctx.includes("estadoRef.current = 'activa'"), 'el catch sigue pisando el estado con activa')
  assert.match(ctx, /stateAfterStatusError/, 'el contexto no usa el criterio compartido')
})
