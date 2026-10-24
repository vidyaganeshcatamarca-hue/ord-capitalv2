// tests/inversiones/distribucion-por-inversion.test.js
//
//   node --test tests/inversiones/distribucion-por-inversion.test.js
//
// S6 del dueño (2026-10-24, verbatim): "En la pestaña de gráfico está haciendo la
// distribución por tipo de inversión, lo cual es incorrecto. Tienes que distribuir
// por cada una de las inversiones que tenemos. Si tengo cinco inversiones, muestro
// las cinco inversiones con sus diferentes porcentajes. Si tengo tres, muestro tres.
// Si tengo una, una. No mostramos la distribución por tipo variable o plazo fijo."

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const { clasificarDistribucion } = await import('../../src/lib/distribucionInversiones.ts')

const fila = (over) => ({
  inversion_id: 1,
  nombre_activo: 'Bitcoin',
  tipo_activo: 'variable',
  cantidad: 1,
  valor_total: 100,
  porcentaje_valor: 100,
  ...over,
})

test('cinco inversiones son cinco porciones, aunque sean del mismo tipo', () => {
  const rows = ['Bitcoin', 'Cripto try', 'Plazo 30d', 'Fondo', 'Acciones'].map((nombre, i) =>
    fila({ inversion_id: i + 1, nombre_activo: nombre, valor_total: 100, porcentaje_valor: 20 })
  )
  const r = clasificarDistribucion(rows)
  assert.equal(r.modo, 'inversion')
  assert.equal(r.filas.length, 5, 'el mismo tipo no puede fusionar inversiones distintas')
})

test('una sola inversión es una sola porción', () => {
  const r = clasificarDistribucion([fila({ valor_total: 1258930, porcentaje_valor: 100 })])
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].nombre_activo, 'Bitcoin')
})

test('dos inversiones del mismo tipo no se suman', () => {
  const r = clasificarDistribucion([
    fila({ inversion_id: 1, nombre_activo: 'Bitcoin', valor_total: 350000, porcentaje_valor: 28 }),
    fila({ inversion_id: 2, nombre_activo: 'Cripto try', valor_total: 900000, porcentaje_valor: 72 }),
  ])
  assert.equal(r.filas.length, 2)
  assert.deepEqual(r.filas.map((f) => f.valor_total), [350000, 900000])
})

test('sin nombre (backend sin migrar) agrupa por tipo como antes', () => {
  const r = clasificarDistribucion([
    fila({ inversion_id: null, nombre_activo: null, tipo_activo: 'variable', cantidad: 2, valor_total: 1258930, porcentaje_valor: 100 }),
  ])
  assert.equal(r.modo, 'tipo')
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].cantidad, 2)
})

test('filas viejas de varios tipos se agrupan y suman', () => {
  const r = clasificarDistribucion([
    fila({ nombre_activo: null, tipo_activo: 'variable', cantidad: 2, valor_total: 600, porcentaje_valor: 60 }),
    fila({ nombre_activo: null, tipo_activo: 'plazo_fijo', cantidad: 1, valor_total: 400, porcentaje_valor: 40 }),
  ])
  assert.equal(r.modo, 'tipo')
  assert.equal(r.filas.length, 2)
  assert.equal(r.filas[0].tipo_activo, 'variable')
  assert.equal(r.filas[0].valor_total, 600)
})

test('sin filas no se inventa nada', () => {
  assert.deepEqual(clasificarDistribucion([]), { modo: 'inversion', filas: [] })
  assert.deepEqual(clasificarDistribucion(null).filas, [])
})

test('la migración 91 ya no agrupa por tipo', () => {
  const sql = read('temp_sql/91_distribucion_por_inversion.sql')
  assert.match(sql, /i\.nombre_activo/, 'la función tiene que devolver el nombre de la inversión')
  assert.ok(
    !/GROUP BY\s*\(CASE WHEN i\.tasa_anual_tna/i.test(sql),
    'el agrupado por tipo es justamente lo que el dueño rechazó'
  )
  assert.match(sql, /fn_valor_a_moneda_local/, 'la conversión a moneda local se conserva')
})

test('el gráfico usa el modo y el nombre de la inversión', () => {
  const view = read('src/components/inversiones/DistribucionView.tsx')
  assert.match(view, /clasificarDistribucion\(/, 'la vista tiene que clasificar antes de pintar')
  assert.match(view, /nombre_activo/, 'y mostrar el nombre de cada inversión')
})
