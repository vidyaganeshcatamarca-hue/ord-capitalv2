// tests/inversiones/separadores-solo-locales.test.js
//
//   node --test tests/inversiones/separadores-solo-locales.test.js
//
// Dueño, 2026-10-24: "separeadores solo quedan los locales que son los globales.
// Los de segunda y tercera moneda borrar."
//
// Viene de S21: el separador se elige UNA vez (moneda local) y vale para toda la
// app; lo único por moneda es la CANTIDAD de decimales.
//
// La trampa que este test pinea: `fn_configurar_formato_moneda` exigía separadores
// (error_field_required). Si se borran los guardados sin relajar la RPC, editar los
// decimales de la 2ª moneda empieza a fallar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const sql = read('temp_sql/93_separadores_solo_locales.sql')

test('la RPC deja de exigir separadores', () => {
  assert.ok(
    !/error_field_required[^\n]*separadores/.test(sql),
    'el error de separadores requeridos ya no puede estar'
  )
  assert.match(sql, /NULLIF\(TRIM\(COALESCE\(p_separador_miles, ''\)\), ''\)/, 'los separadores vacíos son válidos')
  assert.match(sql, /IF v_miles IS NOT NULL AND v_decimal IS NOT NULL AND v_miles = v_decimal THEN/, 'sólo se valida si vienen los dos')
})

test('la entrada guardada lleva decimales siempre y separadores sólo si vienen', () => {
  assert.match(sql, /jsonb_build_object\('decimales', p_decimales\)/, 'decimales siempre')
  assert.match(sql, /v_entrada := v_entrada \|\| jsonb_build_object\('separador_miles', v_miles\)/, 'miles opcional')
  assert.match(sql, /v_entrada := v_entrada \|\| jsonb_build_object\('separador_decimal', v_decimal\)/, 'decimal opcional')
})

test('la limpieza borra los separadores de la 2ª y 3ª moneda y conserva los de la local', () => {
  assert.match(sql, /- 'separador_miles' - 'separador_decimal'/, 'se borran las dos claves')
  assert.match(
    sql,
    /WHEN e\.key = COALESCE\(r\.moneda_default, 'ARS'\)\s*\n\s*THEN e\.value/,
    'la moneda local conserva sus separadores: es de donde los toma el formateador'
  )
})

test('el front manda null cuando la moneda no tiene separadores guardados', () => {
  const front = read('src/pages/Configuracion/RegionFormatoPage.tsx')
  assert.match(front, /p_separador_miles: next\[code\]\.separador_miles \?\? null/)
  assert.match(front, /p_separador_decimal: next\[code\]\.separador_decimal \?\? null/)
})
