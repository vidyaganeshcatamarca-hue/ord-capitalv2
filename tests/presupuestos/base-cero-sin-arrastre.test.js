// tests/presupuestos/base-cero-sin-arrastre.test.js
//
//   node --test tests/presupuestos/base-cero-sin-arrastre.test.js
//
// S2 de odd/tasks/base-cero-logica.md: en base cero no hay arrastre y, en el
// ciclo en que el usuario se pasó, los gastos se cuentan solo desde la fecha de
// activación. La función desplegada es
// temp_sql/132_base_cero_sin_arrastre.sql.
//
// Por qué importa: con los datos del user 1 el arrastre de septiembre seguía
// vivo (−2.443.777) y 2.287.700 de gastos anteriores al traspaso marcaban todos
// los sobres en rojo. El deploy dejó arrastre 0, gasto 0 y el disponible en la
// liquidez real (2.627.275).
//
// El script de despliegue también se verifica: los usuarios en modo anticipado
// son el control de regresión (no pueden moverse ni un peso) y la definición que
// se restaura tiene que cerrar en ';' (el CREATE de pg_get_functiondef no lo
// trae, y eso ya rompió una reversión).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const leer = (...partes) => fs.readFileSync(path.join(repo, ...partes), 'utf8')
const sinComentarios = (sql) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

const sql = sinComentarios(leer('temp_sql', '132_base_cero_sin_arrastre.sql'))
const deploy = leer('temp_sql', '133_deploy_132.mjs')

test('en base cero el arrastre del mes anterior es cero', () => {
  assert.match(sql, /v_arrastre_cero := \(v_modo_presupuesto = 'base_cero'\)/)
  assert.match(
    sql,
    /CASE WHEN v_arrastre_cero THEN 0\s+ELSE COALESCE\(p\.monto_limite, 0\) - COALESCE\(gm\.total_gastado, 0\) END as balance_mes_anterior/,
    'el balance anterior tiene que apagarse en base cero',
  )
})

test('el ciclo de activación cuenta gastos solo desde la activación', () => {
  assert.match(sql, /v_fecha_activacion BETWEEN v_f_inicio AND v_f_fin/, 'el corte es solo para el ciclo donde cayó la activación')
  assert.match(sql, /v_f_efectiva := v_fecha_activacion/)
  assert.match(
    sql,
    /FROM p_caja c WHERE c\.tipo = 'expense' AND c\.fecha >= v_f_efectiva/,
    'gastos_mes tiene que arrancar en la fecha efectiva',
  )
  assert.doesNotMatch(sql, /c\.fecha >= v_f_inicio AND c\.fecha <= v_f_fin/, 'el corte viejo no puede sobrevivir')
})

test('sin fecha de activación no se inventa un corte', () => {
  // Usuarios anteriores a la columna: se apaga el arrastre, pero el gasto del
  // ciclo se cuenta completo. No se toca lo que no se puede datar.
  assert.match(sql, /IF v_fecha_activacion IS NOT NULL AND v_fecha_activacion BETWEEN/)
  assert.match(sql, /v_f_efectiva := v_f_inicio;\s*\n\s*IF v_fecha_activacion IS NOT NULL/, 'el valor por defecto es el inicio del ciclo')
})

test('la historia que usan las sugerencias NO se toca', () => {
  // monto_asignado_anterior y monto_gastado_anterior alimentan "lo mismo que el
  // mes anterior" y "lo gastado el mes anterior". Apagarlos rompería las
  // sugerencias: solo se apaga el balance.
  assert.match(sql, /COALESCE\(p\.monto_limite, 0\) as monto_asignado_anterior/)
  assert.match(sql, /COALESCE\(gm\.total_gastado, 0\) as monto_gastado_anterior/)
  assert.doesNotMatch(
    sql,
    /as monto_asignado_anterior[\s\S]{0,80}CASE WHEN v_arrastre_cero/,
    'las columnas de historia no llevan el CASE del arrastre',
  )
})

test('el reporte sigue siendo de solo lectura y con la misma firma', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fn_reporte_sobres_detalle\(p_mes_periodo date/)
  assert.match(sql, /RETURNS TABLE\(estructura_id bigint, nombre_categoria text/)
  assert.match(sql, /SECURITY DEFINER/)
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i, 'el reporte no escribe filas')
})

test('el deploy controla que los usuarios en modo anticipado no cambien', () => {
  assert.match(deploy, /CONTROLES = \[174, 206, 207\]/, 'los anticipados son el control de regresión')
  assert.match(deploy, /\(anticipado\) cambió/, 'si un anticipado se mueve, el deploy falla')
  assert.match(deploy, /POSTCHECK FALLÓ/, 'tiene que existir postcheck')
  assert.match(deploy, /revierto la función al estado anterior/, 'un postcheck fallido revierte')
})

test('el deploy cierra la definición con punto y coma y es idempotente', () => {
  // Las dos cosas rompieron de verdad durante esta tanda: el CREATE sin ';' hizo
  // fallar la reversión, y una segunda corrida no puede re-aplicar a ciegas.
  assert.match(deploy, /const terminar = \(def\)/, 'la definición tiene que cerrar en ;')
  assert.match(deploy, /terminar\(fs\.readFileSync\('temp_sql\/132_base_cero_sin_arrastre\.sql'/, 'el SQL aplicado también')
  assert.match(
    deploy,
    /const yaDesplegada = \/v_arrastre_cero\/\.test\(anterior\)/,
    'el estado se detecta leyendo la función desplegada, no por un flag externo',
  )
  assert.match(deploy, /ya está desplegada: se valida sin re-aplicar/, 're-correr no puede re-aplicar')
})

test('el deploy mide con las funciones reales, impersonando al usuario', () => {
  // El `set_config` en la misma lista de SELECT que la llamada deja auth.uid() en
  // NULL: por eso va en un FROM con LATERAL.
  assert.match(deploy, /cross join lateral public\.fn_reporte_sobres_detalle/, 'la medición va por LATERAL')
  assert.match(deploy, /request\.jwt\.claims/, 'se llama como el usuario')
})
