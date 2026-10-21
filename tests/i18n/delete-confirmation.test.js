// The destructive-action confirmation words.
//
//   node --test tests/i18n/delete-confirmation.test.js
//
// The rules this pins down:
//   1. The word the user types is FIXED and in English. The backend compares
//      it exactly, so a translated word would compare a Spanish word against
//      a Portuguese one and fail silently.
//   2. The word travels as a PLACEHOLDER, not as text: the translator never
//      sees it as a word, so no future translation can translate it.
//   3. The two destructive actions have DIFFERENT words, so the word already
//      typed for one does not unlock the other.
//   4. The two words must match what the backend compares against.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

import { loadDictionary } from './support/i18n-harness.mjs'

const ROOT = path.resolve(process.cwd())
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8')

const es = await loadDictionary('es')
const en = await loadDictionary('en')
const pt = await loadDictionary('pt')

const ACCOUNT_KEY = 'privacidad_delete_placeholder'
const DATA_KEY = 'settings_delete_option_data_confirm_placeholder'

test('the confirmation words are fixed and in English', async () => {
  const mod = await import(
    `file:///${path.join(ROOT, 'src/lib/deleteConfirmation.ts').replace(/\\/g, '/')}`
  )
  assert.equal(mod.DELETE_ACCOUNT_CONFIRMATION_TEXT, 'DELETE')
  assert.equal(mod.DELETE_DATA_CONFIRMATION_TEXT, 'ERASE')
  // They must be different: one word must not unlock both actions.
  assert.notEqual(
    mod.DELETE_ACCOUNT_CONFIRMATION_TEXT,
    mod.DELETE_DATA_CONFIRMATION_TEXT
  )
})

test('the word travels as a placeholder in every language', () => {
  for (const [name, dict] of [['es', es], ['en', en], ['pt', pt]]) {
    for (const key of [ACCOUNT_KEY, DATA_KEY]) {
      const value = dict.errors?.[key] ?? dict.inversiones?.[key]
      assert.ok(value, `${name}.ts is missing ${key}`)
      assert.match(
        value,
        /\{palabra\}/,
        `${name}.${key} must carry the word as the {palabra} placeholder`
      )
      // The word itself must NOT be in the text: the translator would see it
      // and could translate it.
      assert.doesNotMatch(
        value,
        /\bDELETE\b|\bERASE\b/,
        `${name}.${key} must not contain the literal word`
      )
    }
  }
})

test('the placeholder is the one the pipeline protects', () => {
  // The translation pipeline checks that the placeholder names survive byte
  // for byte, so {palabra} is what keeps the word out of the translation.
  const value = es.errors?.[ACCOUNT_KEY] ?? es.inversiones?.[ACCOUNT_KEY]
  const names = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
  assert.deepEqual(names, ['palabra'])
})

test('the components pass the word to the translator', () => {
  const account = read('src/components/privacidad/DeleteAccountCard.tsx')
  assert.match(
    account,
    /t\(\s*'privacidad_delete_placeholder'/,
    'the account card must pass the word to t()'
  )
  assert.match(account, /palabra:\s*DELETE_ACCOUNT_CONFIRMATION_TEXT/, 'the word must be passed as a parameter')
  assert.match(
    account,
    /toUpperCase\(\)/,
    'the input must uppercase what the user types'
  )

  const data = read('src/components/configuracion/ConfiguracionBorradoCard.tsx')
  assert.match(
    data,
    /t\(\s*'settings_delete_option_data_confirm_placeholder'/,
    'the data card must pass the word to t()'
  )
  assert.match(data, /palabra:\s*DELETE_DATA_CONFIRMATION_TEXT/, 'the data card must pass the word to t()')
  assert.match(data, /toUpperCase\(\)/, 'the data input must uppercase the input')
})

test('the backend compares against the same words', () => {
  // The mirror in funcionesSQL/ is the record of what the database does.
  for (const [file, word] of [
    ['funcionesSQL/fn_eliminar_cuenta_usuario.md', 'DELETE'],
    ['funcionesSQL/fn_borrar_datos_usuario.md', 'ERASE'],
  ]) {
    assert.ok(existsSync(path.join(ROOT, file)), `${file} is missing`)
    const content = read(file)
    assert.match(
      content,
      new RegExp(`IS DISTINCT FROM '${word}'`),
      `${file} must compare against '${word}'`
    )
  }
})
