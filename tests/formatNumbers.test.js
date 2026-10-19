// tests/formatNumbers.test.js
// Source-contract checks for the PER-CURRENCY 'Formato de números' card in
// Región y formato (feature: menu-ajustes-ui-refinements, spec S2 / task U3).
// Pure source inspection: no React render, no supabase, no network.
//
// The owner asked for the single 4-select block (local decimals / USD decimals /
// thousands separator / decimal separator) to become THREE currency groups, each
// one carrying its own decimals + thousands separator, visually separated by a
// divider. The data layer for that already exists in the backend (P3 deploy 78):
// fn_obtener_formato_moneda (read) and fn_configurar_formato_moneda (write).
//
// What this file locks:
//   1. RegionFormatoPage ships an isolated `NumberFormatByCurrency` component
//      that renders the three groups (local / second / third) with labels from
//      settings_fmt_* and at least two <hr> dividers between them;
//   2. the card consumes the per-currency RPCs (read + write) with the
//      p_moneda / p_decimales / p_separador_miles / p_separador_decimal contract,
//      and reverts the optimistic state when the write fails;
//   3. the old global block is gone (no select ids, no config_decimals_local /
//      config_decimals_usd call sites, no global updatePref keys);
//   4. P3's monedas-extra RPCs stay out of this page (T8 owns them);
//   5. the cards below the format card (first weekday, time format) and the
//      cards below the format card remain; the retired CurrenciesBlock
//      placeholder must NOT come back (BloqueMonedas of P3 owns the monedas).
//
//   node --test tests/formatNumbers.test.js
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PAGE_PATH = path.join(
  __dirname,
  '..',
  'src',
  'pages',
  'Configuracion',
  'RegionFormatoPage.tsx',
)
const ES_PATH = path.join(__dirname, '..', 'src', 'locales', 'es.ts')

const pageSource = fs.readFileSync(PAGE_PATH, 'utf-8')

// New i18n keys U3 introduces (S2). The legacy config_decimals_* keys stay in
// es.ts as dead keys: they are NOT deleted by this task.
const NEW_KEYS = [
  'settings_fmt_local',
  'settings_fmt_second',
  'settings_fmt_third',
  'settings_fmt_third_desc',
  'settings_fmt_decimals',
  // Error keys live in the errors section of es.ts (monedas-extra-libres merge
  // owns them there: error_formato_moneda_moneda_invalida,
  // error_formato_moneda_decimales, error_separators_must_differ). Empty
  // separators reuse error_field_required. Without the keys parseError()
  // would print the raw key inside the toast.
]

// Legacy keys that must survive as dead keys (they are still in the i18n
// required-keys contract, tests/i18n/settings-keys.test.js).
const KEPT_LEGACY_KEYS = ['config_decimals_local', 'config_decimals_usd']

// Select ids of the retired global block. `id="` prefix included on purpose: the
// new per-group ids (fmt-dec-local / fmt-sep-local / …) must not collide with it.
const OLD_SELECT_IDS = [
  'id="decimales-local"',
  'id="decimales-usd"',
  'id="separador-miles"',
  'id="separador-decimal"',
]

// Call sites / handler keys of the retired global block.
const OLD_CALL_SITES = [
  "t('config_decimals_local')",
  "t('config_decimals_usd')",
  "updatePref('decimales_moneda_local'",
  "updatePref('decimales_segunda_moneda'",
  "updatePref('separador_miles'",
  "updatePref('separador_decimal'",
]

// P3 / T8 owns these. They must NOT appear in the page (see
// tests/regionCurrenciesBlock.test.js, which asserts the same for the block).
const P3_RPC_NAMES = [
  'fn_obtener_monedas_extra',
  'fn_configurar_monedas_extra',
  'fn_obtener_cotizacion',
]

function definedEsKeys() {
  const keys = new Set()
  const pattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm
  for (const match of fs.readFileSync(ES_PATH, 'utf-8').matchAll(pattern)) {
    keys.add(match[1])
  }
  return keys
}

test('the format card is its own NumberFormatByCurrency component (S2)', () => {
  assert.match(
    pageSource,
    /function\s+NumberFormatByCurrency\s*\(/,
    'the per-currency format UI must be an isolated component',
  )
  assert.match(
    pageSource,
    /<NumberFormatByCurrency[\s\S]*?\/>/,
    'the page must render <NumberFormatByCurrency />',
  )
})

test('the three groups are labelled local / second / third and split by <hr> (S2)', () => {
  const componentStart = pageSource.indexOf('function NumberFormatByCurrency')
  assert.ok(componentStart !== -1, 'NumberFormatByCurrency must exist')

  for (const key of ['settings_fmt_local', 'settings_fmt_second', 'settings_fmt_third']) {
    const call = `t('${key}')`
    const callIndex = pageSource.indexOf(call, componentStart)
    assert.ok(
      callIndex > componentStart,
      `the group label ${call} must be rendered inside NumberFormatByCurrency`,
    )
  }

  // One <hr> at each group boundary (before the second and the third group). The
  // divider lives inside the group map, so the source carries one element that
  // renders on two boundaries — the contract is the conditional, not a count.
  assert.match(
    pageSource,
    /index > 0 \? <hr className="config-section-divider" \/>/,
    'every group after the first must be preceded by an <hr> divider',
  )
})

test('the card reads the live per-currency format map (S2)', () => {
  assert.match(
    pageSource,
    /rpc(?:<[^>]+>)?\(\s*'fn_obtener_formato_moneda'/,
    "the read must go through rpc('fn_obtener_formato_moneda')",
  )
})

test('the card writes through fn_configurar_formato_moneda with its full contract (S2)', () => {
  const writeIndex = pageSource.search(/rpc\(\s*'fn_configurar_formato_moneda'/)
  assert.ok(
    writeIndex !== -1,
    "the write must go through rpc('fn_configurar_formato_moneda')",
  )
  const writeBlock = pageSource.slice(writeIndex, writeIndex + 400)
  for (const param of [
    'p_moneda:',
    'p_decimales:',
    'p_separador_miles:',
    'p_separador_decimal:',
  ]) {
    assert.ok(writeBlock.includes(param), `the write call must send ${param}`)
  }
})

test('an optimistic write reverts the local state when the RPC fails (S2)', () => {
  const handlerStart = pageSource.indexOf('const updateCurrencyFormat')
  assert.ok(handlerStart !== -1, 'the page must own the per-currency write handler')
  assert.ok(
    handlerStart > pageSource.indexOf('export function RegionFormatoPage'),
    'the write belongs to the page: the card stays presentational',
  )
  const handlerEnd = pageSource.indexOf('\n  return (', handlerStart)
  const handler = pageSource.slice(handlerStart, handlerEnd === -1 ? undefined : handlerEnd)
  assert.ok(
    handler.includes('setFormats(previous)'),
    'the failing write path must restore the previous map (no silent divergence)',
  )
  assert.match(handler, /catch\s*\(/, 'the write must be wrapped in try/catch')
  assert.ok(
    handler.includes('parseError(err)'),
    'the failing write must surface parseError(err) through the toast',
  )
  assert.ok(
    !/\.then\(/.test(handler),
    'the RPC call must use async/await, not a .then() chain',
  )
})

test('each group renders its own preview from its own decimals and separators (S2)', () => {
  // formatPreview is a page-level helper defined next to the other format
  // helpers (before NumberFormatByCurrency); assert it exists and that the
  // component consumes t('config_preview') per group (the row lives in the
  // component body, not in the helper).
  assert.match(
    pageSource,
    /function\s+formatPreview\s*\(/,
    'the preview must be computed per group by a small helper',
  )
  const componentStart = pageSource.indexOf('function NumberFormatByCurrency')
  const component = pageSource.slice(componentStart)
  assert.ok(
    component.indexOf("t('config_preview')") > 0,
    "the existing preview row (t('config_preview')) stays inside the card",
  )
})

test('the retired global 4-select block is gone (S2)', () => {
  for (const old of [...OLD_SELECT_IDS, ...OLD_CALL_SITES]) {
    assert.ok(!pageSource.includes(old), `RegionFormatoPage.tsx must not keep ${old}`)
  }
})

// ==== Bug 2 (owner, 2026-10-19): paired separators + one-row layout ====
// Owner rules:
//   - thousands and decimal separator live side by side in the SAME row
//     (title + edit next to each other);
//   - changing the thousands separator swaps the decimal one immediately
//     ('.' <-> ',') so the two never share a symbol, EXCEPT when space is
//     chosen (no automatic flip).

test('the page exports the counterpartSeparator swap helper (bug 2)', () => {
  assert.match(
    pageSource,
    /export function counterpartSeparator\(/,
    'the swap rule must be a helper the page exports',
  )
  const helper = pageSource.slice(pageSource.indexOf('function counterpartSeparator'))
  assert.ok(
    helper.includes("return ','") && helper.includes("return '.'"),
    "the helper must pair '.' with ',' and ',' with '.'",
  )
  assert.match(
    helper,
    /return null/,
    'space (and unknown values) must NOT trigger an automatic flip',
  )
})

test('thousands and decimal selectors swap each other in one patch (bug 2)', () => {
  const component = pageSource.slice(pageSource.indexOf('function NumberFormatByCurrency'))
  assert.match(
    component,
    /counterpartSeparator\(/,
    'both separator handlers must consult the counterpart helper',
  )
  const miles = component.slice(component.indexOf("t('config_thousands_separator')"))
  const decimals = component.slice(miles.indexOf('onUpdate'), miles.indexOf('</select'))
  assert.match(
    miles + decimals,
    /separador_decimal/,
    'the miles patch must carry the swapped decimal value',
  )
  const decimal = component.slice(component.indexOf("t('config_decimal_separator')"))
  const milesInDecimal = decimal.slice(decimal.indexOf('onUpdate'), decimal.indexOf('</select'))
  assert.match(
    decimal + milesInDecimal,
    /separador_miles/,
    'the decimal patch must carry the mirrored miles value',
  )
})

test('miles and decimal select sit side by side in one row (bug 2 layout)', () => {
  assert.match(
    pageSource,
    /config-section-fmt-separators/,
    'the two separator selects must share one row (title + edit side by side)',
  )
  const decimalIndex = pageSource.indexOf(
    "t('config_decimal_separator')",
    pageSource.indexOf('function NumberFormatByCurrency'),
  )
  assert.ok(
    decimalIndex > 0,
    'the per-currency decimal separator select must exist inside the card',
  )
})

test("P3's monedas-extra RPCs stay out of this page (T8 boundary)", () => {
  for (const rpcName of P3_RPC_NAMES) {
    assert.ok(
      !pageSource.includes(rpcName),
      `RegionFormatoPage.tsx must not reference ${rpcName}`,
    )
  }
})

test('the cards below the format card remain and no CurrenciesBlock placeholder exists (retired, bug-1)', () => {
  for (const kept of [
    'id="primer-dia-semana"',
    'id="formato-hora"',
  ]) {
    assert.ok(pageSource.includes(kept), `${kept} must survive the reorganisation`)
  }
  assert.ok(
    !/(function\s+CurrenciesBlock\s*\(|<CurrenciesBlock)/.test(pageSource),
    'CurrenciesBlock placeholder stays retired (bug-1 decision)',
  )
})

test('es.ts ships the new per-currency keys and keeps the legacy ones', () => {
  const keys = definedEsKeys()
  const missing = NEW_KEYS.filter((key) => !keys.has(key))
  assert.deepEqual(missing, [])
  const dropped = KEPT_LEGACY_KEYS.filter((key) => !keys.has(key))
  assert.deepEqual(dropped, [], 'legacy config_decimals_* keys must not be deleted')
})
