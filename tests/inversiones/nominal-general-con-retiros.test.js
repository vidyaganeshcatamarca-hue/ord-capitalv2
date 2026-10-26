// tests/inversiones/nominal-general-con-retiros.test.js
//
//   node --test tests/inversiones/nominal-general-con-retiros.test.js
//
// S5 del dueño (2026-10-24): "la tarjeta de la cabecera está mostrando el nominal yield
// general de todas las inversiones pero creo que está calculado mal está tomando en
// cuenta los retiros parciales chequea que este campo tenga la fórmula correcta fíjate
// la diferencia con el real yield."
//
// Tenía razón. En la 92 el agregado hacía (valor − capital)/capital mientras el nominal
// POR INVERSIÓN sumaba los retiros. Bitcoin con 500.000 de capital, 200.000 retirados y
// 350.000 de valor daba −30% arriba y +10% en su detalle.
//
// Verificado contra la base después de aplicar la 96 (postcheck de 97_deploy_96.mjs):
//   usuario 1:   capital 1.500.000, valor 1.370.000, retirado 200.000 → -8,67% a +4,67%
//   usuario 198: capital 3.000,     valor 2.750,     retirado 500     → -8,33% a +8,33%

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const sql = fs.readFileSync(
  path.join(repo, 'temp_sql/96_nominal_general_con_retiros.sql'),
  'utf-8'
)

test('el nominal general suma los retiros parciales', () => {
  assert.match(
    sql,
    /v_rendimiento_nominal := \(\(v_total_actual \+ v_total_retirado - v_total_original\) \/ v_total_original\) \* 100;/
  )
})

test('el valor de cartera que se muestra NO se toca', () => {
  // `total_actual` es el monto grande de la cabecera: sumarle los retiros diría que el
  // usuario tiene plata que ya cobró. Los retiros entran sólo en el rendimiento.
  assert.match(sql, /'total_actual', ROUND\(v_total_actual, 2\)/)
  assert.ok(
    !/v_total_actual := v_total_actual \+ v_conv_(actual|retirado)[^;]*v_conv_retirado/.test(sql),
    'el acumulador de los retiros tiene que ser propio'
  )
  assert.match(sql, /'total_liquidado', ROUND\(v_total_retirado, 2\)/)
})

test('el agregado por moneda suma monto_liquidado, como el por inversión', () => {
  assert.match(sql, /COALESCE\(SUM\(COALESCE\(i\.monto_liquidado, 0\)\), 0\) AS total_liquidado/)
  // Y se convierte a moneda local como los otros dos totales: nunca sumar monedas.
  assert.match(sql, /fn_valor_a_moneda_local\(v_fila\.total_liquidado, v_fila\.moneda, v_user_id\)/)
})

test('la función reemplazada es la misma que alimenta la cabecera', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fn_reporte_rendimiento_vs_inflacion\(\)/)
  const page = fs.readFileSync(path.join(repo, 'src/pages/Inversiones/InversionesPage.tsx'), 'utf-8')
  assert.match(page, /rpc<RendimientoVsInflacion>\('fn_reporte_rendimiento_vs_inflacion'\)/)
})
