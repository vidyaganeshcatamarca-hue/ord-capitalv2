// tests/inversiones/contrato-rpc.test.js
// Contrato entre el frontend y el SQL del módulo de inversiones.
//
//   node --test tests/inversiones/contrato-rpc.test.js
//
// El SQL de la tanda vive en temp_sql/82_deploy_inversiones_puesta_punto.sql y
// todavía NO está desplegado. Este test es la red que detecta una deriva
// entre lo que el backend devuelve y lo que el frontend espera, sin tocar
// producción.
//
// Reglas fijadas aquí:
//   * El header del módulo consume el contrato jsonb de
//     fn_reporte_patrimonio_inversiones: moneda_local, total_moneda_local,
//     totales_por_moneda, monedas_sin_cotizacion. El contrato viejo
//     (total_pesos/total_dolares con p_cotizacion_usd) está PROHIBIDO: mezclaba
//     monedas y la cotización hardcodeada en 1 hacía falso el total "USD".
//   * fn_reporte_cartera_inversiones filtra estado='activa' y trae
//     monto_liquidado (el rescate parcial lo necesita).
//   * fn_reporte_historial_inversiones trae moneda (si no, todo se formatea
//     como la moneda por defecto).
//   * fn_liquidar_inversion no re-acredita el capital ya rescatado.
//   * El frontend llama a fn_obtener_config_inflacion para precargar el tab.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const SQL_PATH = path.join(repo, 'temp_sql', '82_deploy_inversiones_puesta_punto.sql')
const PAGE_PATH = path.join(repo, 'src', 'pages', 'Inversiones', 'InversionesPage.tsx')
const WIDGET_PATH = path.join(repo, 'src', 'components', 'inversiones', 'RendimientoRealWidget.tsx')
const CONFIG_PATH = path.join(repo, 'src', 'components', 'inversiones', 'ConfigInflacionView.tsx')

const sql = fs.readFileSync(SQL_PATH, 'utf-8')
const page = fs.readFileSync(PAGE_PATH, 'utf-8')
const widget = fs.readFileSync(WIDGET_PATH, 'utf-8')
const config = fs.readFileSync(CONFIG_PATH, 'utf-8')

test('el SQL despliega las 8 funciones que la tanda necesita', () => {
  const esperadas = [
    'fn_crear_inversion',
    'fn_reporte_cartera_inversiones',
    'fn_reporte_historial_inversiones',
    'fn_reporte_patrimonio_inversiones',
    'fn_reporte_rendimiento_vs_inflacion',
    'fn_reporte_distribucion_activos',
    'fn_liquidar_inversion',
    'fn_obtener_config_inflacion',
  ]
  for (const fn of esperadas) {
    assert.ok(sql.includes(`CREATE OR REPLACE FUNCTION public.${fn}`), `falta ${fn}`)
  }
})

test('el contrato del patrimonio es jsonb con los 4 campos que el front lee', () => {
  assert.ok(
    sql.includes("RETURNS jsonb") && sql.includes("'moneda_local'") &&
    sql.includes("'total_moneda_local'") && sql.includes("'totales_por_moneda'") &&
    sql.includes("'monedas_sin_cotizacion'"),
    'fn_reporte_patrimonio_inversiones debe devolver el jsonb multimoneda'
  )
  for (const campo of [
    'moneda_local',
    'total_moneda_local',
    'totales_por_moneda',
    'monedas_sin_cotizacion',
  ]) {
    assert.ok(page.includes(campo), `la página debe leer ${campo}`)
  }
})

test('el contrato viejo (total_pesos/total_dolares + p_cotizacion_usd) desapareció', () => {
  assert.ok(!page.includes('p_cotizacion_usd'), 'la página no debe pasar p_cotizacion_usd')
  assert.ok(!page.includes('total_pesos'), 'la página no debe leer total_pesos')
  assert.ok(!page.includes('total_dolares'), 'la página no debe leer total_dolares')
  assert.ok(
    !sql.includes('p_cotizacion_usd numeric DEFAULT 1'),
    'la RPC no debe seguir exponiendo p_cotizacion_usd'
  )
})

test('el widget no muestra ni una moneda hardcodeada', () => {
  assert.ok(!widget.includes("'USD'"), 'el widget no puede hardcodear USD')
  assert.ok(!widget.includes("'ARS'"), 'el widget no puede hardcodear ARS')
  assert.ok(widget.includes('monedaLocal'), 'el widget debe recibir la moneda local')
  assert.ok(widget.includes('lineasPorMoneda'), 'el widget debe recibir las líneas por moneda')
})

test('la cartera filtra por estado activa y trae monto_liquidado', () => {
  const cartera = sql.slice(sql.indexOf('fn_reporte_cartera_inversiones'))
  const bloque = cartera.slice(0, cartera.indexOf('$function$;'))
  assert.ok(bloque.includes("i.estado = 'activa'"), 'la cartera debe filtrar por estado')
  assert.ok(bloque.includes('monto_liquidado'), 'la cartera debe traer monto_liquidado')
})

test('el historial trae la moneda de cada inversión', () => {
  const historial = sql.slice(sql.indexOf('fn_reporte_historial_inversiones'))
  const bloque = historial.slice(0, historial.indexOf('$function$;'))
  assert.ok(bloque.includes('moneda'), 'el historial debe traer la moneda')
})

test('la liquidación acredita solo lo que no se había retirado antes', () => {
  const liquidar = sql.slice(sql.indexOf('fn_liquidar_inversion'))
  const bloque = liquidar.slice(0, liquidar.indexOf('$function$;'))
  assert.ok(
    bloque.includes('v_por_acentrar := p_monto_total_retirado - v_ya_retirado'),
    'la liquidación debe descontar lo ya retirado'
  )
  assert.ok(
    bloque.includes('v_ya_retirado := COALESCE(v_inversion.monto_liquidado, 0)'),
    'debe leer el monto ya liquidado'
  )
})

test('el tab de inflación precarga la config real del usuario', () => {
  assert.ok(
    config.includes('fn_obtener_config_inflacion'),
    'ConfigInflacionView debe leer la config guardada'
  )
})

test('el detalle de inversión traduce los labels de movimiento', () => {
  const detalle = fs.readFileSync(
    path.join(repo, 'src', 'components', 'inversiones', 'DetalleInversionView.tsx'),
    'utf-8'
  )
  assert.ok(
    detalle.includes('formatInversionDetalle'),
    'el detalle debe resolver el detalle del movimiento'
  )
})