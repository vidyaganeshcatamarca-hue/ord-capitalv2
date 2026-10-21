// tests/inversiones/categoria-bloqueada.test.js
// La categoría de Inversiones es EXCLUSIVA del módulo de Inversiones (S7).
//
//   node --test tests/inversiones/categoria-bloqueada.test.js
//
// El dueño: "esa categoría que se crea no debe ser accesible desde el menú de
// categorías. No se le puede cambiar el nombre, es una categoría del sistema y
// no puede tener subcategorías. Tampoco se puede hacer una transacción manual
// a esa categoría de inversiones. Solo se accede a través de las operaciones del
// módulo de inversión. Deberíamos bloquear todo acceso por fuera de este
// módulo a esa categoría."
//
// El filtro del front (src/lib/categoryFilters.ts) es el que decide qué se
// puede editar y qué se puede elegir en un movimiento. Estos tests fijan que
// la categoría de Inversiones queda fuera de AMBOS caminos.
//
// Reglas:
//   * 'cat_investments_portfolio' NO es editable (no aparece en el editor de
//     Categorías). La key vieja 'cat_investments' también está bloqueada:
//     hay filas creadas antes del renombre (migración 84).
//   * NO es elegible en un movimiento manual (alta, edición, cuarentena).
//   * Las categorías normales siguen como siempre.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import {
  isUserEditableCategory,
  filterUserEditableCategories,
  SYSTEM_CATEGORY_NAMES,
} from '../../src/lib/categoryFilters.ts'

test('la categoría de Inversiones NO es editable por el usuario', () => {
  assert.equal(isUserEditableCategory({ nombre_cuenta: 'cat_investments_portfolio' }), false)
  assert.equal(isUserEditableCategory({ nombre_categoria: 'cat_investments_portfolio' }), false)
  // La key vieja, de filas creadas antes del renombre (migración 84).
  assert.equal(isUserEditableCategory({ nombre_cuenta: 'cat_investments' }), false)
  assert.equal(isUserEditableCategory({ nombre_categoria: 'cat_investments' }), false)
})

test('la categoría de Inversiones no aparece en el listado editable', () => {
  const filtrado = filterUserEditableCategories([
    { nombre_cuenta: 'cat_investments_portfolio' },
    { nombre_cuenta: 'cat_comida' },
    { nombre_cuenta: 'cat_transporte' },
  ])
  assert.deepEqual(
    filtrado.map((c) => c.nombre_cuenta),
    ['cat_comida', 'cat_transporte']
  )
})

test('la categoría de Inversiones queda registrada como categoría de sistema', () => {
  assert.ok(
    SYSTEM_CATEGORY_NAMES.includes('cat_investments_portfolio'),
    'cat_investments_portfolio debe estar en la lista de categorías de sistema'
  )
  assert.ok(
    SYSTEM_CATEGORY_NAMES.includes('cat_investments'),
    'la key vieja debe seguir bloqueada mientras haya filas con ella'
  )
})

test('el bloqueo de subcategorías vive en el backend, no en el filtro por nombre', () => {
  // El filtro del front compara por NOMBRE: no puede saber que una categoría
  // cuelga de la de Inversiones. Quien impide crear una hija es el trigger
  // BEFORE INSERT del backend (temp_sql/83_categoria_inversiones_bloqueada.sql),
  // que rechaza cualquier fila cuyo padre sea tipo_cupo='investment'.
  const sql = fs.readFileSync(
    path.join(__dirname, '..', '..', 'temp_sql', '83_categoria_inversiones_bloqueada.sql'),
    'utf-8'
  )
  assert.ok(
    sql.includes('v_padre_es_inversion'),
    'el trigger debe rechazar hijos de la categoría de Inversiones'
  )
  assert.ok(
    sql.includes("BEFORE INSERT OR UPDATE ON public.p_estructuras_egresos"),
    'el trigger debe cubrir INSERT y UPDATE de categorías'
  )
  assert.ok(
    sql.includes("BEFORE DELETE ON public.p_estructuras_egresos"),
    'el trigger debe impedir borrar la categoría de Inversiones'
  )
  assert.ok(
    sql.includes("NEW.metadata->>'inversion_id'"),
    'el trigger de movimientos debe aceptar solo los del módulo (metadata.inversion_id)'
  )
})

test('la categoría de Inversiones tiene key propia y no compite con "Investments"', () => {
  // El dueño: la key tiene que ser única y el nombre no puede competir con
  // una categoría personal del usuario llamada "Investments" en inglés.
  const es = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'locales', 'es.ts'),
    'utf-8'
  )
  assert.ok(
    es.includes('cat_investments_portfolio: "Cartera de Inversiones"'),
    'es.ts debe definir la key nueva con el nombre en español'
  )
  assert.ok(
    !es.includes('\n  cat_investments: "'),
    'la key vieja no debe seguir definiendo un nombre visible'
  )
})

test('el backend busca la categoría por tipo_cupo, no por nombre', () => {
  // El nombre es una key de i18n y puede cambiar (84 lo renombró). Una
  // búsqueda por nombre dejaría los movimientos sin categoría.
  const sql82 = fs.readFileSync(
    path.join(__dirname, '..', '..', 'temp_sql', '82_deploy_inversiones_puesta_punto.sql'),
    'utf-8'
  )
  assert.ok(
    !sql82.includes("nombre_cuenta = 'cat_investments'"),
    'ningún flujo puede buscar la categoría por su nombre viejo'
  )
  assert.ok(
    sql82.includes("tipo_cupo = 'investment'"),
    'la categoría se localiza por tipo_cupo'
  )
})

test('la unicidad de la categoría la garantiza la base, no solo el código', () => {
  const sql84 = fs.readFileSync(
    path.join(__dirname, '..', '..', 'temp_sql', '84_categoria_key_unica.sql'),
    'utf-8'
  )
  assert.ok(
    sql84.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_estructuras_inversion_unica'),
    'debe existir un índice único parcial por usuario'
  )
  assert.ok(
    sql84.includes("ON public.p_estructuras_egresos (user_id)"),
    'el índice único es por usuario'
  )
  assert.ok(
    sql84.includes("WHERE COALESCE(tipo_cupo, '') = 'investment'"),
    'el índice es parcial: solo afecta a las categorías de Inversiones'
  )
  assert.ok(
    sql84.includes('ON CONFLICT (user_id)'),
    'la creación debe ser idempotente ante llamadas concurrentes'
  )
})

test('las categorías del usuario siguen editables (no se rompió nada)', () => {
  assert.equal(isUserEditableCategory({ nombre_cuenta: 'cat_comida' }), true)
  assert.equal(isUserEditableCategory({ nombre_cuenta: 'Remis' }), true)
  assert.equal(isUserEditableCategory({}), true)
  assert.equal(isUserEditableCategory(null), false)
})

test('las categorías de sistema preexistentes siguen bloqueadas', () => {
  assert.equal(isUserEditableCategory({ nombre_cuenta: 'cat_misterio' }), false)
  assert.equal(isUserEditableCategory({ nombre_cuenta: 'no_detail' }), false)
  assert.equal(isUserEditableCategory({ nombre_cuenta: 'cat_card_diff' }), false)
})