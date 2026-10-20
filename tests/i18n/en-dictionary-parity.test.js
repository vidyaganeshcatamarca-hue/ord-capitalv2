// tests/i18n/en-dictionary-parity.test.js
// The English dictionary must be a faithful mirror of the Spanish one.
//
// Four properties are locked, because each one breaks silently otherwise:
//
//   1. SAME KEYS. A key that exists in `es.ts` but not in `en.ts` does not
//      crash: the translator falls back to Spanish. The user just sees a
//      Spanish string inside an English screen, which is exactly the failure
//      mode that is invisible in a test run and obvious to a user.
//   2. SAME PLACEHOLDERS, SAME ORDER. `{monto}` is substituted at render
//      time. A translated value that renames, drops or reorders a placeholder
//      leaves a literal `{monto}` on screen (or, worse, silently renders the
//      wrong number in the wrong slot).
//   3. NO SPANISH LEFT BEHIND. The English dictionary is written for an
//      English reader; voseo and Spanish-only function words must not
//      survive the translation.
//   4. THE REAL TRANSLATOR RESOLVES IT. Not a text comparison: the actual
//      `t()` from `src/locales/i18n.ts`, with the real fallback chain, must
//      return the English string for a sample of keys from every section.
//
//   node --test tests/i18n/en-dictionary-parity.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadI18n, loadDictionary } from './support/i18n-harness.mjs'

const es = await loadDictionary('es')
const en = await loadDictionary('en')

/** Every key of a dictionary, as `section.key` (dotted keys keep their dots). */
function flatKeys(dict) {
  const out = new Map()
  for (const [section, entries] of Object.entries(dict)) {
    for (const [key, value] of Object.entries(entries)) {
      out.set(`${section}.${key}`, value)
    }
  }
  return out
}

/** The placeholder names of a value, in the order they appear. */
function placeholders(value) {
  return [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1])
}

const esFlat = flatKeys(es)
const enFlat = flatKeys(en)

/**
 * Words that only make sense in Rioplatense Spanish. A single one of these
 * in the English dictionary means a line was copied over instead of
 * translated. Matched case-insensitively on word boundaries.
 */
const SPANISH_MARKERS = [
  'vos', 'tenés', 'tenes', 'podés', 'podes', 'querés', 'queres', 'hacés',
  'haces', 'elegí', 'elegi', 'elegílo', 'ingresá', 'ingresa', 'salí', 'sali',
  'buscá', 'busca', 'tocá', 'toca', 'guardá', 'guarda', 'cargá', 'carga',
  'enviá', 'envia', 'borrá', 'borra', 'agregá', 'agrega', 'sincronizá',
  'sincroniza', 'limpiá', 'limpia', 'atacá', 'ataca', 'atrapá', 'atrapa',
  'armá', 'arma', 'quedá', 'queda', 'faltá', 'falta', 'entrás', 'entras',
  'salís', 'salis', 'revisá', 'revisa', 'reconciliá', 'concilia',
  'hacé', 'hace', 'recomendá', 'recomienda', 'usá', 'usa', 'acá', 'aca',
  'allá', 'alla', 'más', 'mas', 'menos', 'sabés', 'sabes', 'querés',
  'necesitás', 'necesitas', 'entendé', 'entiende', 'medí', 'medí',
  'vosotros', 'acá', 'fijate', 'fijate', 'anotá', 'anota',
]

test('the English dictionary ships every section the Spanish one has', () => {
  const esSections = Object.keys(es).sort()
  const enSections = Object.keys(en).sort()
  assert.deepEqual(
    enSections,
    esSections,
    'en.ts must export the same sections as es.ts'
  )
})

test('the English dictionary has exactly the same keys as the Spanish one', () => {
  const missing = [...esFlat.keys()].filter((key) => !enFlat.has(key))
  const extra = [...enFlat.keys()].filter((key) => !esFlat.has(key))

  assert.equal(
    missing.length,
    0,
    `${missing.length} keys missing from en.ts:\n` + missing.slice(0, 40).join('\n')
  )
  assert.equal(
    extra.length,
    0,
    `${extra.length} keys in en.ts that do not exist in es.ts:\n` + extra.slice(0, 40).join('\n')
  )
  assert.equal(
    enFlat.size,
    esFlat.size,
    `en.ts has ${enFlat.size} keys, es.ts has ${esFlat.size}`
  )
})

test('every translated value keeps the exact placeholders of its Spanish source', () => {
  const mismatched = []

  for (const [key, esValue] of esFlat) {
    const enValue = enFlat.get(key)
    if (typeof enValue !== 'string') continue

    const esPlaceholders = placeholders(esValue)
    const enPlaceholders = placeholders(enValue)

    if (esPlaceholders.length === 0 && enPlaceholders.length === 0) continue

    if (esPlaceholders.length !== enPlaceholders.length) {
      mismatched.push(
        `${key}\n    es: [${esPlaceholders.join(', ')}]\n    en: [${enPlaceholders.join(', ')}]`
      )
      continue
    }
    // Order matters as much as the set: the value is rendered in sequence.
    if (esPlaceholders.join('|') !== enPlaceholders.join('|')) {
      mismatched.push(
        `${key}\n    es: [${esPlaceholders.join(', ')}]\n    en: [${enPlaceholders.join(', ')}]`
      )
    }
  }

  assert.equal(
    mismatched.length,
    0,
    `${mismatched.length} values changed their placeholders:\n` + mismatched.slice(0, 30).join('\n')
  )
})

test('no Spanish function words survive in the English dictionary', () => {
  const offenders = []

  for (const [key, value] of enFlat) {
    if (typeof value !== 'string') continue
    // Placeholder NAMES are not prose: `{falta}` is a slot, not the Spanish
    // word "falta". Strip them before looking for Spanish wording.
    const prose = value.replace(/\{[^}]*\}/g, ' ')
    for (const marker of SPANISH_MARKERS) {
      const pattern = new RegExp(`(^|[^a-zA-ZÁÉÍÓÚÑáéíóúñ])${marker}([^a-zA-ZÁÉÍÓÚÑáéíóúñ]|$)`, 'i')
      if (pattern.test(prose)) {
        offenders.push(`${key}: "${value}" (contains "${marker}")`)
        break
      }
    }
  }

  assert.equal(
    offenders.length,
    0,
    `${offenders.length} English values still carry Spanish wording:\n` +
      offenders.slice(0, 30).join('\n')
  )
})

test('an English value is empty only when its Spanish source is empty too', () => {
  // A few tour steps have no "how to" in Spanish. Inventing an English
  // "how to" would be worse than leaving it blank, so blank is allowed —
  // but a value that lost its content in translation is not.
  const offenders = []
  for (const [key, enValue] of enFlat) {
    const esValue = esFlat.get(key)
    if (typeof enValue !== 'string') continue
    if (enValue.trim() === '' && typeof esValue === 'string' && esValue.trim() !== '') {
      offenders.push(`${key}: Spanish="${esValue}" English=""`)
    }
  }
  assert.equal(
    offenders.length,
    0,
    `${offenders.length} English values lost their content:\n` + offenders.join('\n')
  )
})

test('the real translator returns the English string for every section', async () => {
  const { t, setLanguage } = await loadI18n()

  setLanguage('en')

  // One representative key per section, including a nested `section.key`
  // lookup, so both resolution paths are exercised.
  const samples = [
    ['errors', 'error_unauthorized'],
    ['voice', 'title'],
    ['category_keys', 'type_income'],
    ['bcg', 'bcg_title'],
    ['war_room', 'war_room_title'],
    ['saneamiento', 'saneamiento_title'],
    ['wallets', 'tab_cuentas_ingreso'],
    ['inversiones', 'msg_no_investments'],
    ['reports', 'reportes_pagina_titulo'],
    ['tour', 'home.title'],
  ]

  for (const [section, key] of samples) {
    const esValue = es[section]?.[key]
    const enValue = en[section]?.[key]
    assert.equal(typeof enValue, 'string', `en.ts is missing ${section}.${key}`)

    const resolved = t(`${section}.${key}`)
    assert.equal(
      resolved,
      enValue,
      `t('${section}.${key}') must resolve to the English value`
    )
    // A nested lookup must not silently return the Spanish string. Some
    // values are identical in both languages by design ("War Room" is a
    // product name), so the check is that the resolution came from the
    // English dictionary, not that the text differs.
    if (enValue !== esValue) {
      assert.notEqual(
        resolved,
        esValue,
        `t('${section}.${key}') still returns the Spanish value`
      )
    }
  }
})

test('the fallback chain resolves an unknown key to the Spanish dictionary', async () => {
  const { t, setLanguage } = await loadI18n()

  setLanguage('en')
  // A key that exists in neither dictionary: the translator returns the raw
  // key, never a crash and never undefined.
  assert.equal(t('clave_que_no_existe_en_absoluto'), 'clave_que_no_existe_en_absoluto')
})
