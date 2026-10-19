// tests/onboarding/jsonb-rpc-array.test.js
// Formas de respuesta de las RPCs que RETURN jsonb (tanda 2, BUG3).
//
//   node --test tests/onboarding/jsonb-rpc-array.test.js
//
// Importa el modulo real: src/lib/jsonbRpc.ts no tiene imports.
//
// El bug: fn_obtener_monedas_extra()/fn_configurar_monedas_extra() RETURN
// jsonb — el body que supabase-js entrega al front NO es fijo:
//   * array de strings puro:        ["USD", "CHF"]         (PostgREST moderno)
//   * objeto con la key del nombre: {"fn_obtener_monedas_extra": ["USD"]}
//   * array con UNA fila-objeto:    [{"fn_obtener_monedas_extra": ["USD"]}]
//   * fila-objeto con OTRA key (alias del cliente): [{"extras": ["USD"]}]
// El parser anterior asumia wrapper → un array puro entraba como data[0] =
// 'USD' (string) → extras = [] → el dueño vio 'Sin moneda' tras un save que
// SÍ persistió (verificado en vivo: user 198 = ["CHF"], formateo EUR).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseJsonbStringArray } from '../../src/lib/jsonbRpc.ts'

test('array de strings puro (PostgREST moderno): tal cual', () => {
  assert.deepEqual(parseJsonbStringArray(['USD', 'CHF']), ['USD', 'CHF'])
})

test('objeto con la key del nombre de la funcion', () => {
  assert.deepEqual(
    parseJsonbStringArray({ fn_obtener_monedas_extra: ['USD', 'CHF'] }, 'fn_obtener_monedas_extra'),
    ['USD', 'CHF']
  )
})

test('array con UNA fila-objeto que envuelve la key', () => {
  assert.deepEqual(
    parseJsonbStringArray([{ fn_configurar_monedas_extra: ['EUR', 'CHF'] }], 'fn_configurar_monedas_extra'),
    ['EUR', 'CHF']
  )
})

test('key de ALIAS (la key pedida no existe: usa la única del objeto)', () => {
  assert.deepEqual(parseJsonbStringArray([{ extras: ['CHF'] }], 'fn_obtener_monedas_extra'), ['CHF'])
})

test('normaliza strings (trim/upper) y descarta vacios/nulls', () => {
  assert.deepEqual(parseJsonbStringArray([' usd ', null, '', 'chf']), ['USD', 'CHF'])
})

test('no-array con otra forma (string suelto): null, nada inventado', () => {
  assert.equal(parseJsonbStringArray('USD', 'fn_obtener_monedas_extra'), null)
  assert.equal(parseJsonbStringArray(null, 'fn'), null)
  assert.equal(parseJsonbStringArray({ algo: 'raro' }), null)
})

test('array de OBJETOS sin key conocida: null (no arrastramos basura)', () => {
  assert.equal(parseJsonbStringArray([{ a: 1 }, { b: 2 }], 'fn_x'), null)
})

test('vacios honestos: array vacio y wrapper con array vacio devuelven []', () => {
  assert.deepEqual(parseJsonbStringArray([], 'fn'), [])
  assert.deepEqual(parseJsonbStringArray({ fn: [] }, 'fn'), [])
})