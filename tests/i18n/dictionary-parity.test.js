// tests/i18n/dictionary-parity.test.js
// Every shipped dictionary must be a faithful mirror of the Spanish one.
//
// Four properties are locked for EVERY language, because each one breaks
// silently otherwise:
//
//   1. SAME KEYS. A key that exists in `es.ts` but not in the dictionary
//      does not crash: the translator falls back to Spanish. The user just
//      sees a Spanish string inside a screen in another language, which is
//      exactly the failure mode that is invisible in a test run and obvious
//      to a user.
//   2. SAME PLACEHOLDERS, SAME ORDER. `{monto}` is substituted at render
//      time. A translated value that renames, drops or reorders a placeholder
//      leaves a literal `{monto}` on screen (or, worse, silently renders the
//      wrong number in the wrong slot).
//   3. NO SOURCE-LANGUAGE LEFT BEHIND. The dictionary is written for its own
//      reader; Spanish function words must not survive the translation.
//   4. THE REAL TRANSLATOR RESOLVES IT. Not a text comparison: the actual
//      `t()` from `src/locales/i18n.ts`, with the real fallback chain, must
//      return the translated string for a sample of keys from every section.
//
// The test iterates over `SUPPORTED`, so adding a language does not require
// touching it. The Spanish markers below are the ones that are unmistakably
// Spanish; a language-neutral check (no leftover of the SOURCE language) is
// covered per-language by the marker list each language contributes.
//
//   node --test tests/i18n/dictionary-parity.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadI18n, loadDictionary } from './support/i18n-harness.mjs'
import { SUPPORTED, DEFAULT_LANG } from '../../src/locales/language.ts'

const es = await loadDictionary('es')

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

/**
 * Words that only make sense in Rioplatense Spanish. A single one of these
 * in a dictionary means a line was copied over instead of translated.
 * Matched case-insensitively on word boundaries.
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

/**
 * The languages that need their own leftovers checked, on top of the
 * Spanish markers. Each list holds the words that are unmistakably from
 * that language and would be a copied line rather than a translation.
 */
const LANGUAGE_MARKERS = {
  en: [
    'youre', 'dont', 'cant', 'wont', 'youve', 'theese', 'theres', 'alot',
    'wich', 'teh', 'adn', 'waht', 'savings account', 'recieve', 'seperate',
  ],
  pt: [
    'vc', 'tb', 'tbm', 'hj', 'qdo', 'nda', 'nenhum', 'vc nao', 'vc na',
    'celular', 'salario', 'aluguel', 'saque', 'cota', 'extrato', 'fatura',
  ],
}

/** The dictionary of a language, loaded from `src/locales/<lang>.ts`. */
const dictionaries = new Map()
for (const lang of SUPPORTED) {
  if (lang === 'es') {
    dictionaries.set(lang, es)
    continue
  }
  dictionaries.set(lang, await loadDictionary(lang))
}

test('every shipped language has a dictionary to compare against', () => {
  for (const lang of SUPPORTED) {
    assert.ok(dictionaries.get(lang), `no dictionary loaded for '${lang}'`)
  }
})

for (const lang of SUPPORTED) {
  if (lang === 'es') continue

  const dict = dictionaries.get(lang)
  const flat = flatKeys(dict)
  const markers = [...SPANISH_MARKERS, ...(LANGUAGE_MARKERS[lang] ?? [])]

  test(`the ${lang} dictionary ships every section the Spanish one has`, () => {
    const esSections = Object.keys(es).sort()
    const dictSections = Object.keys(dict).sort()
    assert.deepEqual(
      dictSections,
      esSections,
      `${lang}.ts must export the same sections as es.ts`
    )
  })

  test(`the ${lang} dictionary has exactly the same keys as the Spanish one`, () => {
    const missing = [...esFlat.keys()].filter((key) => !flat.has(key))
    const extra = [...flat.keys()].filter((key) => !esFlat.has(key))

    assert.equal(
      missing.length,
      0,
      `${missing.length} keys missing from ${lang}.ts:\n` + missing.slice(0, 40).join('\n')
    )
    assert.equal(
      extra.length,
      0,
      `${extra.length} keys in ${lang}.ts that do not exist in es.ts:\n` + extra.slice(0, 40).join('\n')
    )
    assert.equal(
      flat.size,
      esFlat.size,
      `${lang}.ts has ${flat.size} keys, es.ts has ${esFlat.size}`
    )
  })

  test(`every ${lang} value keeps the exact placeholders of its Spanish source`, () => {
    const mismatched = []

    for (const [key, esValue] of esFlat) {
      const dictValue = flat.get(key)
      if (typeof dictValue !== 'string') continue

      const esPlaceholders = placeholders(esValue)
      const dictPlaceholders = placeholders(dictValue)

      if (esPlaceholders.length === 0 && dictPlaceholders.length === 0) continue

      if (esPlaceholders.length !== dictPlaceholders.length) {
        mismatched.push(
          `${key}\n    es: [${esPlaceholders.join(', ')}]\n    ${lang}: [${dictPlaceholders.join(', ')}]`
        )
        continue
      }
      // Order matters as much as the set: the value is rendered in sequence.
      if (esPlaceholders.join('|') !== dictPlaceholders.join('|')) {
        mismatched.push(
          `${key}\n    es: [${esPlaceholders.join(', ')}]\n    ${lang}: [${dictPlaceholders.join(', ')}]`
        )
      }
    }

    assert.equal(
      mismatched.length,
      0,
      `${mismatched.length} ${lang} values changed their placeholders:\n` +
        mismatched.slice(0, 30).join('\n')
    )
  })

  test(`no Spanish function words survive in the ${lang} dictionary`, () => {
    const offenders = []

    for (const [key, value] of flat) {
      if (typeof value !== 'string') continue
      // Placeholder NAMES are not prose: `{falta}` is a slot, not the Spanish
      // word "falta". Strip them before looking for leftover wording.
      const prose = value.replace(/\{[^}]*\}/g, ' ')
      for (const marker of markers) {
        const pattern = new RegExp(
          `(^|[^a-zA-ZÁÉÍÓÚÑáéíóúñ])${marker}([^a-zA-ZÁÉÍÓÚÑáéíóúñ]|$)`,
          'i'
        )
        if (pattern.test(prose)) {
          offenders.push(`${key}: "${value}" (contains "${marker}")`)
          break
        }
      }
    }

    assert.equal(
      offenders.length,
      0,
      `${offenders.length} ${lang} values still carry leftover wording:\n` +
        offenders.slice(0, 30).join('\n')
    )
  })

  test(`a ${lang} value is empty only when its Spanish source is empty too`, () => {
    // A few tour steps have no "how to" in Spanish. Inventing a "how to"
    // would be worse than leaving it blank, so blank is allowed — but a value
    // that lost its content in translation is not.
    const offenders = []
    for (const [key, dictValue] of flat) {
      const esValue = esFlat.get(key)
      if (typeof dictValue !== 'string') continue
      if (dictValue.trim() === '' && typeof esValue === 'string' && esValue.trim() !== '') {
        offenders.push(`${key}: Spanish="${esValue}" ${lang}=""`)
      }
    }
    assert.equal(
      offenders.length,
      0,
      `${offenders.length} ${lang} values lost their content:\n` + offenders.join('\n')
    )
  })

  test(`the real translator returns the ${lang} string for every section`, async () => {
    const { t, setLanguage } = await loadI18n()

    setLanguage(lang)

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
      const dictValue = dict[section]?.[key]
      assert.equal(typeof dictValue, 'string', `${lang}.ts is missing ${section}.${key}`)

      const resolved = t(`${section}.${key}`)
      assert.equal(
        resolved,
        dictValue,
        `t('${section}.${key}') must resolve to the ${lang} value`
      )
      // A nested lookup must not silently return the Spanish string. Some
      // values are identical in both languages by design ("War Room" is a
      // product name), so the check is that the resolution came from the
      // right dictionary, not that the text differs.
      if (dictValue !== esValue) {
        assert.notEqual(
          resolved,
          esValue,
          `t('${section}.${key}') still returns the Spanish value`
        )
      }
    }
  })
}

test('the fallback chain resolves an unknown key to the default dictionary', async () => {
  const { t, setLanguage } = await loadI18n()

  setLanguage(DEFAULT_LANG)
  // A key that exists in neither dictionary: the translator returns the raw
  // key, never a crash and never undefined.
  assert.equal(t('clave_que_no_existe_en_absoluto'), 'clave_que_no_existe_en_absoluto')
})
