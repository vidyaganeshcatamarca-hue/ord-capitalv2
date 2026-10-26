// tests/inversiones/aporte-suma-valor.test.js
//
//   node --test tests/inversiones/aporte-suma-valor.test.js
//
// S2 del dueño (ronda 6): "cuando sumamos capital a una inversión […] el current value
// debe actualizarse sumando ese dinero ingresado al momento del ingreso. Y se debe volver
// a calcular el gain, porque si no pasa como quedó ahora, que sumé 200.000 y el valor
// actual quedó en un millón y me figura una pérdida, porque el valor actual no se ha
// actualizado solo."
//
// La regla: el aporte suma en los DOS lados (capital y valor), así que la ganancia no
// cambia al aportar. Y los retiros anteriores siguen siendo retiros.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')

const { investmentGainAmount } = await import('../../src/lib/inversionesPatrimonio.ts')

const crudo = fs.readFileSync(
  path.join(repo, 'temp_sql', '100_aporte_suma_valor_y_retiros.sql'),
  'utf8'
)
// Para las aserciones de AUSENCIA hay que sacar los comentarios: el propio archivo
// documenta los campos que no toca.
const sql = crudo.replace(/--.*$/gm, '')

test('el aporte suma al valor actual, no sólo al capital', () => {
  assert.match(
    sql,
    /valor_mercado_actual = COALESCE\(valor_mercado_actual, monto_invertido_original\) \+ p_monto/,
    'sin esto el capital sube y el valor no: la resta capital − valor aparece como pérdida'
  )
  assert.match(
    sql,
    /monto_invertido_original = monto_invertido_original \+ p_monto/,
    'el capital tiene que seguir subiendo'
  )
})

test('el aporte no toca lo que ya estaba: retiros ni fecha de inicio', () => {
  assert.doesNotMatch(sql, /monto_liquidado/, 'los retiros anteriores siguen siendo retiros')
  assert.doesNotMatch(sql, /fecha_inicio/, 'no es una inversión nueva: la antigüedad se mantiene')
})

test('la reparación de los aportes viejos no cuenta dos veces', () => {
  // `monto_invertido_original` YA incluye el aporte (lo sumó la versión vieja), así que
  // hay que reconstruir el capital previo antes de volver a sumar. Sin la resta, un
  // valor en NULL sumaría el aporte dos veces.
  assert.match(
    sql,
    /COALESCE\(i\.valor_mercado_actual, i\.monto_invertido_original - a\.total\) \+ a\.total/
  )
  assert.match(sql, /m\.metadata->>'es_aporte' = 'true'/, 'sólo los aportes, no cualquier inversión')
})

test('aportar 200.000 sobre un millón deja la ganancia en cero', () => {
  // Antes: capital 1.200.000 contra valor 1.000.000 → −200.000 de pérdida inventada.
  const antes = { monto_invertido_original: 1_000_000, valor_actual_teorico: 1_000_000, monto_liquidado: 0 }
  assert.equal(investmentGainAmount(antes), 0)

  const despues = { monto_invertido_original: 1_200_000, valor_actual_teorico: 1_200_000, monto_liquidado: 0 }
  assert.equal(investmentGainAmount(despues), 0, 'aportar no es ganar ni perder')

  // Y el valor viejo (el bug reportado) sigue marcando la pérdida, para dejar claro qué
  // es lo que se corrigió: la diferencia está sólo en el valor actual.
  const conBug = { monto_invertido_original: 1_200_000, valor_actual_teorico: 1_000_000, monto_liquidado: 0 }
  assert.equal(investmentGainAmount(conBug), -200_000)
})

test('los retiros se leen de la caja, uno por uno, y no de un total agregado', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fn_retiros_inversiones\(\)/)
  assert.match(sql, /m\.detalle LIKE 'rescate_inversion:%'/, 'la convención que ya usan las liquidaciones')
  assert.match(sql, /COALESCE\(m\.valor_ingreso, 0\) > 0/, 'sólo entradas de dinero')
  assert.match(
    sql,
    /m\.metadata->>'inversion_id' ~ '\^\[0-9\]\+\$'/,
    'un metadata no numérico no puede tirar abajo la pantalla con un cast'
  )
  assert.match(sql, /m\.user_id = v_user_id/, 'cada usuario ve sólo sus retiros')
})
