// tests/inversiones/reglas-negocio.test.js
// Reglas de negocio del módulo de Inversiones (B2, B3/B4, B5, B7, B8).
//
//   node --test tests/inversiones/reglas-negocio.test.js
//
// Estos tests fijan las reglas que el dueño definió el 2026-10-21 después de
// probar el módulo en su teléfono. Son contrato de frontend (lo que el front
// tiene que cumplir) y de backend (lo que el SQL tiene que garantizar).
//
// Reglas:
//   B2 — No se puede invertir más de lo que hay en la billetera. El front solo
//        ofrece billeteras de la moneda elegida con saldo suficiente; el
//        backend rechaza el egreso sin saldo.
//   B3/B4 — Tres fuentes de inflación: proxy_dolar (por defecto), manual y
//        desactivado. 'api_automatica' no existe.
//   B5 — El botón Guardar solo aparece si hay cambios.
//   B7 — Al borrar el movimiento de creación de una inversión, la inversión se
//        anula también.
//   B8 — El país de la configuración de inflación NO está hardcodeado: es el
//        del usuario, y el catálogo viene de la base (p_paises).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..', '..')
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const modal = read('src/components/inversiones/NuevaInversionModal.tsx')
const configView = read('src/components/inversiones/ConfigInflacionView.tsx')
const sql86 = read('temp_sql/86_inversiones_saldo_e_inflacion_manual.sql')
const sql86b = read('temp_sql/86b_saldo_y_cascada.sql')
const es = read('src/locales/es.ts')

// ─────────────────────────── B2 — saldo suficiente ───────────────────────────

test('B2: el front solo ofrece billeteras con saldo suficiente', () => {
  assert.ok(
    modal.includes('Number(b.saldo) >= montoNum'),
    'el selector debe filtrar por saldo >= monto invertido'
  )
  assert.ok(
    modal.includes('billeterasDeLaMoneda = billeteras.filter((b) => b.moneda === moneda)'),
    'y solo billeteras de la moneda elegida'
  )
  assert.ok(
    modal.includes('billeteraElegibleActual') && modal.includes('billeteraOk'),
    'la validacion del formulario debe exigir una billetera elegible'
  )
})

test('B2: el backend rechaza el egreso de inversión sin saldo', () => {
  assert.ok(
    sql86b.includes('tr_validar_saldo_inversion'),
    'debe existir el trigger de saldo'
  )
  assert.ok(
    sql86b.includes('error_investment_insufficient_balance'),
    'con el error de saldo insuficiente'
  )
  assert.ok(
    /IF v_saldo < v_monto THEN[\s\S]{0,200}error_investment_insufficient_balance/.test(sql86b),
    'la comparacion debe ser saldo < monto'
  )
})

// ─────────────────── B3/B4 — tres fuentes de inflación ──────────────────────

test('B3/B4: el selector ofrece exactamente tres fuentes', () => {
  const fuentes = configView.match(/value: '(proxy_dolar|manual|desactivado|api_automatica)'/g) || []
  assert.deepEqual(
    fuentes.sort(),
    ["value: 'desactivado'", "value: 'manual'", "value: 'proxy_dolar'"].sort(),
    'las fuentes deben ser proxy_dolar, manual y desactivado — nada más'
  )
  assert.ok(
    !configView.includes("value: 'api_automatica'"),
    'api_automatica no puede offered (nunca estuvo implementada)'
  )
})

test('B3/B4: el proxy dólar es la fuente por defecto', () => {
  assert.ok(
    configView.includes("useState<FuenteInflacion>('proxy_dolar')"),
    'el default del estado es proxy_dolar'
  )
  assert.ok(
    sql86.includes("'proxy_dolar'") && sql86.includes("'manual'") && sql86.includes("'desactivado'"),
    'el backend valida las tres fuentes'
  )
})

test('B3/B4: la fuente manual exige un valor anual', () => {
  assert.ok(
    sql86.includes('error_inflation_manual_value_required'),
    'sin valor manual la función debe rechazar'
  )
  assert.ok(
    sql86.includes('p_inflacion_manual_anual_pct'),
    'el valor manual se persiste'
  )
  assert.ok(
    configView.includes('p_inflacion_manual_anual_pct'),
    'el front lo envía'
  )
})

test('B3/B4: el CHECK constraint de la base permite las tres fuentes', () => {
  assert.ok(
    sql86.includes("fuente_inflacion IN ('proxy_dolar', 'manual', 'desactivado')"),
    'el CHECK debe permitir exactamente las tres fuentes'
  )
})

// ───────────────────────────── B5 — botón Guardar ────────────────────────────

test('B5: el botón Guardar solo se renderiza si hay cambios', () => {
  assert.ok(
    configView.includes('hayCambios') && configView.includes('{hayCambios && ('),
    'el botón debe estar condicionado a hayCambios'
  )
})

// ─────────────────── B7 — borrar el movimiento anula la inversión ───────────

test('B7: borrar el movimiento de creación anula la inversión', () => {
  assert.ok(
    sql86b.includes('tr_anular_inversion_al_borrar_movimiento'),
    'debe existir el trigger de cascada'
  )
  assert.ok(
    sql86b.includes("OLD.detalle NOT LIKE 'investment_prefix:%'"),
    'solo debe actuar sobre el movimiento de creación'
  )
  assert.ok(
    sql86b.includes('DELETE FROM public.p_inversiones'),
    'debe borrar la inversión'
  )
})

// ───────────────────────── B8 — el país no está hardcodeado ──────────────────

test('B8: el país de la inflación NO está hardcodeado', () => {
  assert.ok(
    !/PAISES: \{ value: Pais; key: string \}\[\] = \[\s*\{ value: 'AR'/.test(configView),
    'no puede haber una lista de países fija con AR al principio'
  )
  assert.ok(
    !configView.includes("value: 'AR'") && !configView.includes("value: 'MX'"),
    'ningún país puede estar hardcodeado en el selector'
  )
})

test('B8: el país por defecto es el del usuario', () => {
  assert.ok(
    configView.includes('countryCode') && configView.includes('setPais(countryCode)'),
    'el default es el país del usuario (p_config_region.pais_codigo)'
  )
})

test('S14: el país no se elige en el módulo — es el de la configuración regional', () => {
  // S14 (2026-10-22): el dueño fue explícito: "el país no debe aparecer y no
  // debe ser seleccionable ni cambiable". Esto reemplaza al requisito B8 (que
  // pedía un catálogo de países en el selector): ya no hay selector.
  assert.ok(
    !configView.includes('useCountryCatalog'),
    'no debe montar un catálogo de países: el país no se elige acá'
  )
  assert.ok(
    !/id="config-inflacion-pais"/.test(configView),
    'no debe haber un <select> de país'
  )
  assert.ok(
    configView.includes('countryCode') && configView.includes('setPais(countryCode)'),
    'el país sale de la configuración regional (p_config_region.pais_codigo)'
  )
})

// ─────────────────────────── textos y errores ─────────────────────────────────

test('las claves nuevas existen en es.ts', () => {
  for (const key of [
    'inflation_source_manual:',
    'inflation_source_manual_desc:',
    'inflation_source_desactivado_desc:',
    'label_inflation_manual_value:',
    'error_inflation_manual_value_required:',
    'error_investment_insufficient_balance:',
    'error_no_wallets_with_balance:',
    'msg_inflation_disabled:',
  ]) {
    assert.ok(es.includes(key), `falta la key ${key}`)
  }
})

test('ya no existe la clave de la API automática', () => {
  assert.ok(
    !es.includes('inflation_source_api_automatica:'),
    'la fuente api_automatica se eliminó del catálogo de textos'
  )
})
