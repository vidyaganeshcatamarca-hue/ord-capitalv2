// tests/presupuestos/saldo-a-asignar-deficit.test.js
//
//   node --test tests/presupuestos/saldo-a-asignar-deficit.test.js
//
// S1 de odd/tasks/base-cero-logica.md: los sobres en rojo no pueden sumar al
// "disponible para asignar". La función desplegada es
// temp_sql/130_saldo_deficit_no_suma.sql; este test congela la invariante sobre
// el fuente, para que una re-escritura no reintroduzca el defecto.
//
// Por qué importa el número: con los datos del user 1 la fórmula vieja devolvía
// 7.358.752 contra 2.627.275 de liquidez real, y el guard de
// fn_asignar_presupuesto usa ese mismo valor, así que dejaba presupuestar plata
// que no existe. El deploy dejó 2.378.745.
//
// Además se verifica el script de despliegue: si el postcheck falla tiene que
// revertir la función, y tiene que poder re-correr sin romper nada. Ese script ya
// falló una vez justo en la reversión (el CREATE no cerraba en ';').

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const leer = (...partes) => fs.readFileSync(path.join(repo, ...partes), 'utf8')

// Los comentarios del archivo explican el defecto viejo: si se parsean, una
// aserción de ausencia (`SUM(monto_disponible)` no aparece) fallaría por el
// propio comentario, que sí lo nombra.
const sinComentarios = (sql) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

const sql = sinComentarios(leer('temp_sql', '130_saldo_deficit_no_suma.sql'))
const deploy = leer('temp_sql', '131_deploy_130.mjs')

test('la fórmula resta solo los saldos positivos de los sobres', () => {
  assert.match(
    sql,
    /SUM\(GREATEST\(monto_disponible,\s*0\)\)/,
    'el disponible tiene que restar GREATEST(monto_disponible, 0)',
  )
  assert.doesNotMatch(
    sql,
    /SUM\(monto_disponible\)/,
    'SUM(monto_disponible) completo vuelve a sumar los déficits: es el defecto que esta tanda corrige',
  )
})

test('la fórmula sigue siendo liquidez menos sobres menos cuotas de tarjeta', () => {
  assert.match(sql, /v_total_ingresos - v_total_asignado - v_total_tarjetas/, 'no puede cambiar el resto de la fórmula')
  assert.match(sql, /FROM p_cuotas_detalle/, 'las cuotas impagas siguen restando')
  assert.match(sql, /es_fondo_prevision = false/, 'el fondo de previsión no cuenta como liquidez')
})

test('reemplaza la función correcta, sin tocar datos ni relajar la seguridad', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fn_obtener_saldo_a_asignar\(p_mes_periodo date\)/)
  assert.match(sql, /SECURITY DEFINER/)
  assert.match(sql, /SET search_path TO 'public'/)
  // La tanda 1 es una función: si aparece un DML, dejó de serlo.
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i, 'esta tanda no modifica filas')
})

test('el script de despliegue verifica antes y después, y revierte si falla', () => {
  assert.match(deploy, /POSTCHECK FALLÓ/, 'tiene que existir un postcheck explícito')
  assert.match(deploy, /revierto la función al estado anterior/, 'un postcheck fallido tiene que revertir')
  assert.match(deploy, /NO SE PUDO REVERTIR/, 'si la reversión falla, el operador tiene que enterarse')

  // La reversión falló una vez por esto: pg_get_functiondef no cierra con ';'.
  assert.match(deploy, /const terminar = \(def\)/, 'la definición a restaurar tiene que cerrar con punto y coma')

  // Idempotencia: re-correr el script sobre un deploy hecho no debe re-aplicar ni
  // dar falso negativo.
  assert.match(deploy, /estado === 'nueva'/, 'tiene que reconocer que ya está desplegado')
  assert.match(deploy, /se valida sin re-aplicar/)
})

test('el script mide con las funciones reales, no con una réplica a mano', () => {
  // Una réplica de la fórmula se desincroniza (el reporte, por ejemplo, incluye
  // filas del hogar) y el postcheck mentiría justo después de haber commiteado.
  assert.match(deploy, /fn_reporte_sobres_detalle/, 'los saldos de sobres salen del reporte real')
  assert.match(deploy, /fn_obtener_saldo_a_asignar/, 'se verifica el RPC desplegado')
  assert.match(deploy, /request\.jwt\.claims/, 'se llama como el usuario, que es como lo llama la app')
})
