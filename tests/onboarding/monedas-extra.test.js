// tests/onboarding/monedas-extra.test.js
// Derivacion de opciones de moneda para el picker de billeteras (T2).
//
//   node --test tests/onboarding/monedas-extra.test.js
//
// Importa el modulo real con type stripping: funciona solo porque
// src/lib/monedasExtra.ts no tiene imports propios (mismo contrato que
// currencySymbol.ts).
//
// S11/S5: local + extras efectivas del usuario; el backend hace las
// validaciones de catalogo y limite (S9/S5), esta funcion solo arma la lista
// honesta para la UI: local primero, extras en el orden guardado, sin
// duplicados ni mayusculas inconsistentes.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildWalletCurrencyOptions } from '../../src/lib/monedasExtra.ts'

test('local primero + extras en orden guardado', () => {
  assert.deepEqual(buildWalletCurrencyOptions('ARS', ['USD', 'EUR']), ['ARS', 'USD', 'EUR'])
})

test('local repetido en extras se excluye (S10: un usuario USD ve solo su local)', () => {
  assert.deepEqual(buildWalletCurrencyOptions('USD', ['USD']), ['USD'])
})

test('normaliza a mayusculas y trims', () => {
  assert.deepEqual(buildWalletCurrencyOptions(' ars ', [' usd ', 'eur']), ['ARS', 'USD', 'EUR'])
})

test('dedupe: extras duplicadas o que repiten la local no se repiten', () => {
  assert.deepEqual(buildWalletCurrencyOptions('ARS', ['USD', 'usd', 'ARS']), ['ARS', 'USD'])
})

test('extras vacias -> solo la local', () => {
  assert.deepEqual(buildWalletCurrencyOptions('EUR', []), ['EUR'])
})

test('sin local (region sin resolver) -> solo extras normalizadas, no lista vacia', () => {
  assert.deepEqual(buildWalletCurrencyOptions(null, ['USD', 'EUR']), ['USD', 'EUR'])
  assert.deepEqual(buildWalletCurrencyOptions('', ['USD']), ['USD'])
})

test('sin nada -> lista vacia (nada inventado)', () => {
  assert.deepEqual(buildWalletCurrencyOptions(null, []), [])
})

test('entrada null/undefined no revienta', () => {
  assert.deepEqual(buildWalletCurrencyOptions('ARS', null), ['ARS'])
})
// ── S7/S8/S9, ronda 4 (2026-10-24) ──────────────────────────────────────────
// Dueño: "me sale ese mensaje de error como si quisiera cambiar una moneda en
// dólares cuando la tercera moneda está configurada en pesos o al menos eso dice la
// pantalla" y "no sé si la segunda y la tercera moneda me las muestra bien o las
// heredó del usuario anterior cargado en el mismo teléfono lo cual sospecho".
//
// La base estaba bien: el usuario 20 tiene monedas_extra = ["USD"] y 1 billetera
// activa en USD, así que el error era correcto. Lo que mentía era la pantalla, que
// mostraba la segunda y tercera moneda del 198 (["BRL","ARS"]) porque
// `useMonedasExtra` memoizaba su promesa en una variable de módulo sin distinguir
// usuario. Mismo defecto que la región (bug 9), en el hook vecino.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const src = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf-8')

test('el memo de monedas extra pertenece a UN usuario', () => {
  const hook = src('src/hooks/useMonedasExtra.ts')
  assert.match(hook, /reuseForUser\(extrasEntry, userId\)/, 'debe reusar la memo sólo para el mismo usuario')
  assert.match(hook, /extrasEntry: UserKeyedEntry<string\[\] \| null> \| null/, 'la memo guarda el userId dueño')
  // El patrón viejo: una promesa de módulo que se devuelve sin mirar quién la pidió.
  assert.ok(
    !/let extrasPromise: Promise<string\[\] \| null> \| null = null/.test(hook),
    'una promesa de módulo cruda es exactamente el bug de la herencia'
  )
})

test('cerrar sesión tira el memo de monedas extra, como el de la región', () => {
  const auth = src('src/contexts/AuthContext.tsx')
  assert.match(auth, /invalidateMonedasExtraCache\(\)/, 'SIGNED_OUT debe limpiar el memo de extras')
  assert.match(auth, /invalidateRegionCache\(\)/, 'y el de la región sigue limpiándose')
})

test('la tercera moneda se puede dejar vacía con la ✕', () => {
  const bloque = src('src/components/configuracion/BloqueMonedas.tsx')
  // S7: "no tengo la opción siempre tengo que elegir una moneda [...] no puedo
  // anularla". La ✕ existe y guarda el slot vacío.
  assert.match(bloque, /handleSave\(slot2, slot3, slot2, ''\)/, 'la ✕ de la tercera manda la tercera vacía')
  assert.match(bloque, /handleSave\(slot2, slot3, '', slot3\)/, 'la ✕ de la segunda manda la segunda vacía')
})
