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

// ───────── S6b (2026-10-24): dos monedas en la misma celda ─────────────────
// Dueño: "como las inversiones pueden ser de divisas diferentes, debes convertirlas
// a moneda local solo para sacar el % del donut [...] No puedes sumar moneda local
// con otra moneda dentro del mismo donut." Y después: "muestras los valores en
// moneda de la inversión y entre parentesis el valor en moneda local".

test('cada porción conserva su valor en SU moneda', () => {
  const rows = [
    fila({ inversion_id: 1, nombre_activo: 'Cripto try', valor_propio: 2500, moneda: 'BRL', valor_total: 1750000, porcentaje_valor: 80 }),
    fila({ inversion_id: 2, nombre_activo: 'Bitcoin', valor_propio: 350000, moneda: 'ARS', valor_total: 350000, porcentaje_valor: 20 }),
  ]
  const r = clasificarDistribucion(rows)
  assert.equal(r.filas[0].valor_propio, 2500)
  assert.equal(r.filas[0].moneda, 'BRL', 'un valor en reales no puede quedar rotulado en pesos')
  assert.equal(r.filas[1].valor_propio, 350000)
})

test('el agrupado por tipo no suma valores de monedas distintas', () => {
  const r = clasificarDistribucion([
    fila({ nombre_activo: null, tipo_activo: 'variable', valor_propio: 2500, moneda: 'BRL', valor_total: 1750000, porcentaje_valor: 80 }),
    fila({ nombre_activo: null, tipo_activo: 'variable', valor_propio: 350000, moneda: 'ARS', valor_total: 350000, porcentaje_valor: 20 }),
  ])
  assert.equal(r.modo, 'tipo')
  assert.equal(r.filas[0].valor_propio, null, 'no se inventa un valor propio para la suma')
  assert.equal(r.filas[0].moneda, null)
  assert.equal(r.filas[0].valor_total, 2100000, 'solo hay un total comparable: el local')
})

test('la celda muestra la moneda propia y el local entre paréntesis', () => {
  const view = read('src/components/inversiones/DistribucionView.tsx')
  assert.match(view, /formatCurrency\(item\.valor_propio, item\.moneda\)/, 'primero el valor propio')
  assert.match(view, /\(\{formatCurrency\(item\.valor_total\)\}\)/, 'y el local entre paréntesis')
})

test('la migración devuelve el valor propio y su moneda', () => {
  const sql = read('temp_sql/91_distribucion_por_inversion.sql')
  assert.match(sql, /valor_propio numeric/, 'la función tiene que devolver el valor sin convertir')
  assert.match(sql, /COALESCE\(i\.moneda, 'ARS'\)::text AS moneda/, 'y la moneda de origen')
})

test('el subtítulo sigue al modo: no describe una cosa y muestra otra', () => {
  const view = read('src/components/inversiones/DistribucionView.tsx')
  // Verificado en el navegador el 2026-10-24: con el SQL 91 sin aplicar, el
  // subtítulo decía "Distribution by investment" y la tabla "Asset type".
  assert.match(view, /porInversion\s*\n?\s*\?\s*t\('distribution_subtitle'\)/, 'por inversión usa su subtítulo')
  assert.match(view, /t\('distribution_subtitle_tipo'\)/, 'y el agrupado usa el de tipo de activo')
  assert.ok(
    !/<p className="distribucion-subtitle">\{t\('distribution_subtitle'\)\}<\/p>/.test(view),
    'el subtítulo no puede estar fijo en "por inversión"'
  )
})

// ── S4, ronda 5 (2026-10-24) ────────────────────────────────────────────────
// Dueño: "solo debes mostrar este valor a las inversiones que no son en moneda local.
// Las que son en moneda local no tienes que mostrar nada en este campo porque ya está
// mostrado en el campo anterior. Asimismo, el número 100% dentro del donut es
// irrelevante, quítalo, y ponle a cada color de cada inversión el porcentaje que
// representa en el donut, en la parte externa de cada color."
const { mostrarEquivalenteLocal } = await import('../../src/lib/distribucionInversiones.ts')

test('el equivalente local sólo se muestra para monedas distintas de la local', () => {
  // El usuario 198 tiene local GBP: Xxx y Ypf en GBP no llevan paréntesis, Galicia en BRL sí.
  assert.equal(mostrarEquivalenteLocal('GBP', 'GBP'), false)
  assert.equal(mostrarEquivalenteLocal('BRL', 'GBP'), true)
  assert.equal(mostrarEquivalenteLocal('brl', 'gbp'), true)
  assert.equal(mostrarEquivalenteLocal(' ARS ', 'ars'), false)
})

test('sin datos de moneda se muestra igual: esconder información es peor', () => {
  assert.equal(mostrarEquivalenteLocal(null, 'GBP'), true)
  assert.equal(mostrarEquivalenteLocal('ARS', undefined), true)
})

test('la tabla usa el helper y el donut ya no centra el 100%', () => {
  const view = read('src/components/inversiones/DistribucionView.tsx')
  assert.match(view, /mostrarEquivalenteLocal\(item\.moneda, getFormatContext\(\)\.localCurrency\)/)

  const donut = read('src/components/inversiones/DistribucionDonut.tsx')
  assert.ok(!/'100%'/.test(donut), 'el 100% del centro tiene que desaparecer')
  assert.match(donut, /distribucion-donut-pct/, 'cada porción lleva su porcentaje')
  // Fuera del anillo: el radio de la etiqueta es mayor que el borde externo del anillo.
  assert.match(donut, /labelRadius = radius \+ strokeWidth \/ 2 \+ 8/)
})
