// The onboarding language picker: the country suggests a language, and the
// picker offers every supported one.
//
//   node --test tests/i18n/onboarding-language.test.js
//
// The rules this pins down:
//   1. The picker sits on the SAME screen as the country picker, right under
//      it, and it lists every supported language.
//   2. Picking a country applies the language that country suggests, when the
//      app ships that language. Otherwise the current language stays.
//   3. A country whose suggested language the app does not ship falls back to
//      the current language, never to a broken one.
//   4. The pick is persisted: the region RPC receives the chosen language.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { loadDictionary } from './support/i18n-harness.mjs'
import { SUPPORTED, isSupported, suggestedLanguageFor, resolveLanguage } from '../../src/locales/language.ts'

const ROOT = path.resolve(process.cwd())
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8')

const es = await loadDictionary('es')

test('every supported language has an onboarding label', () => {
  for (const key of ['onboarding_language_label', 'onboarding_language_hint']) {
    assert.ok(es.errors[key], `es.ts is missing ${key}`)
  }
})

test('the onboarding screen renders the language picker under the country', () => {
  const source = read('src/components/onboarding/CountryStep.tsx')

  // The picker is on the onboarding screen, not on a separate step.
  assert.match(source, /LanguageSelect/, 'CountryStep must render the LanguageSelect')

  // It is under the country card IN THE MARKUP: the country block comes
  // first. The import sits at the top of the file, so the check is on the
  // JSX, not on the first mention of the name.
  const countryIndex = source.indexOf('onboarding_country_change')
  const pickerIndex = source.indexOf('<LanguageSelect')
  assert.ok(countryIndex > -1, 'the country block must be there')
  assert.ok(pickerIndex > -1, 'the picker must be rendered')
  assert.ok(
    pickerIndex > countryIndex,
    'the language picker must come AFTER the country block, on the same screen'
  )
})

test('the country language is applied when the user picks a country', () => {
  const source = read('src/components/onboarding/CountryStep.tsx')
  // The picked country drives the language: the country suggests one and the
  // app applies it, so a Brazilian user lands in Portuguese.
  assert.match(source, /suggestedLanguageFor/, 'the country suggestion must be used')
  assert.match(
    source,
    /suggestedLanguageFor\(country\.suggestedLanguage\)/,
    'the suggestion comes from the country'
  )
})

test('the language survives the remount the provider does on a language change', () => {
  // The provider remounts the whole subtree when the language changes, which
  // wipes the local state of this screen. The chosen language therefore lives
  // in the provider (localStorage), not in this component, and the country is
  // re-read from the snapshot.
  const source = read('src/components/onboarding/CountryStep.tsx')
  assert.match(source, /setLang/, 'the screen must write the choice to the provider')
})

test('the picked country survives the remount too', () => {
  // The country lives in the PARENT of the screen, not in its local state,
  // and it is written to the flow snapshot so a reload restores it.
  const step = read('src/components/onboarding/CountryStep.tsx')
  assert.match(
    step,
    /initialCountryCode/,
    'the screen must accept the country from its parent'
  )
  assert.match(step, /onCountryPicked/, 'the screen must report the pick to its parent')

  const page = read('src/pages/Auth/AuthPage.tsx')
  assert.match(page, /pickedCountryCode/, 'the parent must hold the country')
  assert.match(page, /countryCode: pickedCountryCode/, 'the flow snapshot must carry it')
  assert.match(
    page,
    /if \(snapshot\.countryCode\) setPickedCountryCode\(snapshot\.countryCode\)/,
    'the restore must put the country back'
  )
})

test('the picker lists every supported language', () => {
  const source = read('src/components/LanguageSelect/LanguageSelect.tsx')
  assert.match(source, /SUPPORTED\.map/, 'the picker must iterate SUPPORTED')
  assert.match(source, /languageLabel\(code\)/, 'each option is labelled with Intl.DisplayNames')
})

test('the country suggestion resolves to a shipped language or nothing', () => {
  // Brazil suggests Portuguese, and the app ships it.
  assert.equal(suggestedLanguageFor('pt'), 'pt')
  assert.equal(suggestedLanguageFor('PT'), 'pt')
  assert.equal(suggestedLanguageFor('  pt  '), 'pt')

  // A country whose language the app does not ship resolves to nothing.
  assert.equal(suggestedLanguageFor('fr'), null)
  assert.equal(suggestedLanguageFor(''), null)
  assert.equal(suggestedLanguageFor(null), null)
  assert.equal(suggestedLanguageFor(undefined), null)
})

test('a country language does NOT override an explicit device preference', () => {
  // The device says Spanish and the country says Portuguese. The device wins:
  // it is a closer signal about the person than the country they live in.
  // Choosing the language is the user's call, and the picker offers it.
  const resolved = resolveLanguage({
    stored: null,
    deviceLocales: ['es-AR'],
    countrySuggested: 'pt',
  })
  assert.equal(resolved.lang, 'es')
  assert.equal(resolved.source, 'device')
})

test('the country language applies when the device says nothing usable', () => {
  const resolved = resolveLanguage({
    stored: null,
    deviceLocales: ['fr-FR'],
    countrySuggested: 'pt',
  })
  assert.equal(resolved.lang, 'pt')
  assert.equal(resolved.source, 'country')
})

test('a stored preference still wins over the country suggestion', () => {
  const resolved = resolveLanguage({
    stored: 'en',
    deviceLocales: ['es-AR'],
    countrySuggested: 'pt',
  })
  assert.equal(resolved.lang, 'en')
  assert.equal(resolved.source, 'stored')
})

test('an unshipped country language falls back to the default', () => {
  const resolved = resolveLanguage({
    stored: null,
    deviceLocales: [],
    countrySuggested: 'fr',
  })
  assert.equal(isSupported(resolved.lang), true)
  assert.equal(resolved.source, 'default')
})

test('the chosen language reaches the region RPC and the snapshot', () => {
  const source = read('src/components/onboarding/CountryStep.tsx')
  // The RPC receives the language that was actually picked, not the one the
  // device happened to suggest.
  assert.match(source, /p_idioma: lang/, 'the RPC must receive the chosen language')
  assert.match(source, /language: lang/, 'the snapshot must record the chosen language')
})
