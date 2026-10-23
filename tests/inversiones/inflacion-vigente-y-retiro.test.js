// tests/inversiones/inflacion-vigente-y-retiro.test.js
// S12/S13/S14/S15/S16/S17 (odd/tasks/inversiones-v2-correcciones.md).
//
//   node --test tests/inversiones/inflacion-vigente-y-retiro.test.js
//
// Lo que el dueño vio en producción:
//   1. el cartel "Configurá tu fuente de inflación" no se iba NUNCA, aunque la
//      fuente fuera proxy dólar (que es el default): la inflación se congelaba
//      al guardar y quedaba en 0;
//   2. en el gráfico la tabla cortaba la columna Valor ("$ 35" en lugar de
//      "$ 350.000") y el donut empujaba la pantalla;
//   3. el país se podía elegir en el tab de inflación;
//   4. una liquidación parcial se mostraba como pérdida del 40%.
//
// Estos tests fijan las causas, no solo los síntomas: que la inflación se
// calcule en la lectura, que el nominal sume lo ya retirado y que la moneda de
// destino se valide en el servidor.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const SQL90 = 'temp_sql/90_inflacion_vigente_y_retiro_parcial.sql'

// ─────────────────────────── backend: inflación ──────────────────────────────

test('S12: la inflación se calcula en la lectura, no se congela al guardar', () => {
  const sql = read(SQL90)
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.fn_inflacion_vigente/,
    'debe existir un helper que calcule la inflación vigente'
  )
  // El bug era leer la columna guardada como si fuera un valor actual.
  const rendimiento = sql.slice(sql.indexOf('fn_reporte_rendimiento_vs_inflacion'))
  assert.match(
    rendimiento,
    /fn_inflacion_vigente\(v_user_id\)/,
    'el reporte de rendimiento debe pedirle la inflación al helper vivo'
  )
})

test('S12: sin fila guardada, la fuente por defecto es proxy_dolar', () => {
  const sql = read(SQL90)
  assert.match(
    sql,
    /v_fuente := COALESCE\(v_fuente_cfg, 'proxy_dolar'\)/,
    'el default tiene que ser proxy_dolar, no "sin configurar"'
  )
})

test('S14: el país que manda es el de la configuración regional, no el guardado', () => {
  const sql = read(SQL90)
  assert.match(
    sql,
    /v_pais := COALESCE\(NULLIF\(v_pais_region, ''\), NULLIF\(v_pais_cfg, ''\)\)/,
    'el país regional define la moneda local; un país viejo guardado no puede pisarlo'
  )
})

test('S12/S17: se informa el motivo y la ventana real de la inflación', () => {
  const sql = read(SQL90)
  for (const key of ['motivo', 'ventana_6m_meses', 'ventana_12m_meses', 'disponible']) {
    assert.ok(sql.includes(`'${key}'`), `el payload debe incluir ${key}`)
  }
  assert.match(
    sql,
    /'sin_datos'/,
    'sin cotizaciones hay que decirlo: no hay nada que configurar'
  )
})

test('S12: el helper interno no queda expuesto por PostgREST', () => {
  const sql = read(SQL90)
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.fn_inflacion_vigente\(bigint\) FROM PUBLIC, anon, authenticated/,
    'un helper interno no debe poder llamarse desde el cliente'
  )
})

test('S17: la inflación también se informa anualizada, y se muestra en la pestaña', () => {
  const sql = read(SQL90)
  assert.match(
    sql,
    /v_anualizada := ROUND\(/,
    'el backend tiene que anualizar la variación acumulada de la ventana real'
  )
  assert.match(
    sql,
    /POWER\(1 \+ \(v_inflacion_6m \/ 100\), 12 \/ v_ventana_6m\)/,
    'anualizar = (1 + acumulada)^(12/meses) - 1'
  )
  assert.match(sql, /'inflacion_anualizada'/, 'la clave tiene que viajar al front')

  const view = read('src/components/inversiones/ConfigInflacionView.tsx')
  assert.match(
    view,
    /label_inflation_annual/,
    'la pestaña de inflación tiene que mostrar el valor anual'
  )
})

// ─────────────────────── backend: retiro parcial ─────────────────────────────

test('S16: el rendimiento nominal suma lo ya retirado (un retiro no es pérdida)', () => {
  const sql = read(SQL90)
  const cartera = sql.slice(
    sql.indexOf('fn_reporte_cartera_inversiones'),
    sql.indexOf('fn_reporte_historial_inversiones')
  )
  assert.match(
    cartera,
    /COALESCE\(i\.monto_liquidado, 0\)/,
    'la cartera tiene que comparar (valor actual + retirado) contra el capital'
  )
})

test('S16: el detalle expone monto_liquidado para poder explicarlo', () => {
  const sql = read(SQL90)
  const detalle = sql.slice(
    sql.indexOf('fn_reporte_detalle_inversion'),
    sql.indexOf('fn_reporte_cartera_inversiones')
  )
  assert.match(detalle, /'monto_liquidado'/, 'el detalle debe devolver lo retirado')
  assert.match(
    detalle,
    /COALESCE\(v_inversion\.monto_liquidado, 0\)/,
    'y usarlo en el cálculo del nominal'
  )
})

// ───────────────────── backend: moneda al liquidar ───────────────────────────

test('S15: el backend rechaza liquidar a una billetera de otra moneda', () => {
  const sql = read(SQL90)
  const liquidar = sql.slice(sql.indexOf('fn_liquidar_inversion'))
  assert.match(
    liquidar,
    /FROM public\.p_billeteras/,
    'tiene que leer la moneda de la billetera destino'
  )
  assert.match(
    liquidar,
    /error_wallet_currency_mismatch/,
    'y cortar cuando la moneda no coincide con la de la inversión'
  )
  // El guard tiene que estar ANTES del primer INSERT, o el movimiento ya se
  // habría registrado cuando salta el error.
  const posGuard = liquidar.indexOf('error_wallet_currency_mismatch')
  const posInsert = liquidar.indexOf('INSERT INTO p_caja')
  assert.ok(posGuard > 0 && posInsert > 0, 'deben existir el guard y el insert')
  assert.ok(posGuard < posInsert, 'el guard va antes de acreditar la plata')
})

test('S15: el front solo ofrece billeteras de la misma moneda', () => {
  const modal = read('src/components/inversiones/LiquidarInversionModal.tsx')
  assert.match(
    modal,
    /billeteras\.filter\(\(b\) => b\.moneda === moneda\)/,
    'el selector debe filtrar por la moneda de la inversión'
  )
})

// ───────────────────────────── front: inflación ──────────────────────────────

test('S12: el cartel de configurar aparece solo si de verdad falta configurar', () => {
  const widget = read('src/components/inversiones/RendimientoRealWidget.tsx')
  assert.match(
    widget,
    /motivo_inflacion === 'manual_sin_valor'/,
    'el CTA no puede depender solo de "no hay inflación": depende del motivo'
  )
  assert.match(
    widget,
    /msg_inflation_no_data/,
    'cuando faltan datos se dice eso, no se pide configurar'
  )
})

test('S14: el tab de inflación no tiene selector de país', () => {
  const view = read('src/components/inversiones/ConfigInflacionView.tsx')
  assert.ok(
    !/id="config-inflacion-pais"/.test(view),
    'no debe haber un <select> para elegir país'
  )
  assert.ok(
    !/const PAISES/.test(view),
    'el array PAISES vacío era el bug que impedía aplicar el país guardado'
  )
})

// ────────────────────────────── front: gráfico ───────────────────────────────

test('S13: la tabla del gráfico entra en el teléfono (sin min-width fijo)', () => {
  // Se comparan las reglas, no los comentarios: el propio comentario del
  // arreglo nombra el "min-width: 520px" que se quitó.
  const css = read('src/components/inversiones/DistribucionView.css').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  )
  assert.ok(
    !/min-width:\s*520px/.test(css),
    'el min-width de 520px era lo que cortaba la columna Valor en un teléfono'
  )
  assert.match(css, /table-layout:\s*fixed/, 'la tabla se reparte el ancho disponible')
})

test('S13: el donut es más chico que antes (220px)', () => {
  const donut = read('src/components/inversiones/DistribucionDonut.tsx')
  const m = donut.match(/size = (\d+)/)
  assert.ok(m, 'el donut debe tener un tamaño por defecto explícito')
  assert.ok(
    Number(m[1]) < 200,
    `el donut por defecto era 220px y empujaba la pantalla; ahora es ${m[1]}`
  )
})

// ───────────────────────────────── i18n ─────────────────────────────────────

test('las keys nuevas están en los tres diccionarios', () => {
  const keys = [
    'msg_inflation_no_data',
    'label_inflation_computed',
    'label_inflation_window_months',
    'label_partial_withdrawal_note',
    'error_wallet_currency_mismatch',
  ]
  for (const lang of ['es', 'en', 'pt']) {
    const dic = read(`src/locales/${lang}.ts`)
    for (const key of keys) {
      assert.ok(dic.includes(`${key}:`), `${lang} le falta ${key}`)
    }
  }
})

// ───────────────────── porcentajes con el separador regional ────────────────

test('los porcentajes del módulo usan el separador decimal configurado', async () => {
  const { formatPercent, setFormatContext } = await import('../../src/lib/format.ts')

  setFormatContext({ decimalSeparator: ',' })
  assert.equal(formatPercent(12.62, { signed: false }), '12,62%')
  assert.equal(formatPercent(6.665), '+6,67%')
  assert.equal(formatPercent(-40, { signed: false }), '-40,00%')

  // Un usuario que eligió punto en su configuración regional ve punto.
  setFormatContext({ decimalSeparator: '.' })
  assert.equal(formatPercent(12.62, { signed: false }), '12.62%')
  assert.equal(formatPercent(6.665), '+6.67%')

  // Sin valor no se inventa un número.
  setFormatContext({ decimalSeparator: ',' })
  assert.equal(formatPercent(null), '-')
  assert.equal(formatPercent(undefined), '-')
})

test('ningún componente del módulo formatea porcentajes por su cuenta', () => {
  // El bug: cada archivo tenía su propio formatPercent con toFixed(2), que
  // siempre usa punto y se comía el separador elegido por el usuario.
  const archivos = fs
    .readdirSync(path.join(repo, 'src', 'components', 'inversiones'))
    .filter((f) => f.endsWith('.tsx'))
  for (const archivo of archivos) {
    const src = read(`src/components/inversiones/${archivo}`)
    assert.ok(
      !/function formatPercent\(/.test(src),
      `${archivo} no debe definir su propio formatPercent: usá el de @/lib/format`
    )
    assert.ok(
      !/toFixed\(2\)[`}]*%/.test(src),
      `${archivo} no debe armar porcentajes con toFixed(2) (siempre usa punto)`
    )
  }
})
