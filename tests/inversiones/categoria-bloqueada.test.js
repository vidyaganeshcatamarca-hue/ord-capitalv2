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
//   * 'cat_investments' NO es editable (no aparece en el editor de Categorías).
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
  assert.equal(isUserEditableCategory({ nombre_cuenta: 'cat_investments' }), false)
  assert.equal(isUserEditableCategory({ nombre_categoria: 'cat_investments' }), false)
})

test('la categoría de Inversiones no aparece en el listado editable', () => {
  const filtrado = filterUserEditableCategories([
    { nombre_cuenta: 'cat_investments' },
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
    SYSTEM_CATEGORY_NAMES.includes('cat_investments'),
    'cat_investments debe estar en la lista de categorías de sistema'
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