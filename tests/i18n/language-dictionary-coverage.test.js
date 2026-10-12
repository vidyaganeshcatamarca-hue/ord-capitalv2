// tests/i18n/language-dictionary-coverage.test.js
// Every language listed in SUPPORTED must have a dictionary wired into the
// translator. This is the net that fires when someone adds 'en' to SUPPORTED
// and forgets en.ts: translation lookups would silently return the raw key.
//
//   node --test tests/i18n/language-dictionary-coverage.test.js
//
// i18n.ts is read as text on purpose. Importing it would drag in the
// '@/lib/telemetry' alias, which Node cannot resolve outside Vite.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { SUPPORTED } from '../../src/locales/language.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const i18nPath = path.join(__dirname, '..', '..', 'src', 'locales', 'i18n.ts')
const i18nSource = fs.readFileSync(i18nPath, 'utf-8')

// Matches `const dictionaries: Record<string, any> = { ... }`.
const DICTIONARIES_DECL = /const\s+dictionaries\s*:\s*Record<[^>]*>\s*=\s*\{([\s\S]*?)\}/

/** Keys of the dictionaries map, or null when the declaration is gone. */
function dictionaryKeys() {
  const match = i18nSource.match(DICTIONARIES_DECL)
  if (!match) return null
  return match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(':')[0].trim())
}

test('i18n.ts declares a dictionaries map', () => {
  assert.ok(
    dictionaryKeys(),
    'i18n.ts must declare `const dictionaries: Record<...> = { ... }`'
  )
})

test('every SUPPORTED language has an entry in the dictionaries map', () => {
  const keys = dictionaryKeys() ?? []
  for (const lang of SUPPORTED) {
    assert.ok(
      keys.includes(lang),
      `SUPPORTED lists '${lang}' but the dictionaries map has no '${lang}' entry`
    )
  }
})

test('every SUPPORTED language has its dictionary module imported', () => {
  for (const lang of SUPPORTED) {
    const importRe = new RegExp(`from\\s+['"]\\./${lang}(?:\\.js)?['"]`)
    assert.ok(
      importRe.test(i18nSource),
      `SUPPORTED lists '${lang}' but i18n.ts never imports './${lang}.js'`
    )
  }
})

test('the dictionaries map never references a language outside SUPPORTED', () => {
  const keys = dictionaryKeys() ?? []
  for (const key of keys) {
    assert.ok(
      SUPPORTED.includes(key),
      `the dictionaries map has '${key}' but SUPPORTED does not list it`
    )
  }
})

test('the dictionaries map is not empty', () => {
  assert.ok((dictionaryKeys() ?? []).length > 0, 'the dictionaries map must not be empty')
})
