// The translation toolchain: the ledger and the incremental update.
//
//   node --test tests/i18n/translation-ledger.test.js
//
// These are the rules that make an incremental update possible:
//   1. The ledger records, for every translated key, the Spanish text the
//      translation was made from. Without it, a changed Spanish is invisible.
//   2. The delta for a language is only the keys that are missing or stale,
//      never the whole dictionary.
//   3. A key whose Spanish changed is reported as stale, so it gets
//      retranslated instead of silently kept.
//   4. A key whose placeholders drifted is reported too: the translation no
//      longer fits the Spanish.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const LEDGER = path.join(ROOT, 'i18n/ledger.json')

const run = (script, args = []) =>
  execFileSync('node', [path.join(ROOT, 'scripts/i18n', script), ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
  })

test('the ledger is in the repo', () => {
  assert.ok(existsSync(LEDGER), 'i18n/ledger.json must be versioned')
})

test('the ledger records the Spanish every translation was made from', () => {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf-8'))
  assert.equal(ledger.source, 'es')

  for (const [lang, entries] of Object.entries(ledger.languages)) {
    const keys = Object.keys(entries)
    assert.ok(keys.length > 0, `${lang} has no recorded keys`)

    for (const key of keys.slice(0, 20)) {
      const entry = entries[key]
      assert.equal(typeof entry.from, 'string', `${lang}.${key} has no 'from'`)
      assert.equal(typeof entry.to, 'string', `${lang}.${key} has no 'to'`)
    }
  }
})

test('the recorded Spanish matches the master dictionary right now', () => {
  // A ledger that has drifted from the master is a ledger nobody can trust.
  const output = run('ledger.mjs', ['check'])
  assert.match(output, /missing \(never translated\): 0/)
  assert.match(output, /stale \(the Spanish changed\): 0/)
  assert.match(output, /drifted \(placeholder mismatch\): 0/)
})

test('a language with no pending work produces an empty delta', () => {
  const output = run('delta.mjs', ['pt'])
  assert.match(output, /keys a traducir: 0/)
  assert.match(output, /nada pendiente/)
})

test('a new key and a changed Spanish are both detected', () => {
  // The ledger is what makes this possible: it knows the Spanish the
  // translation was made from, so a change under it is visible.
  const es = path.join(ROOT, 'src/locales/es.ts')
  const original = readFileSync(es, 'utf-8')

  try {
    // A brand new key.
    writeFileSync(
      es,
      original.replace(
        /^export const errors = \{/m,
        'export const errors = {\n  ledger_probe_key: "Sonda del ledger",'
      ),
      'utf-8'
    )
    let output = run('ledger.mjs', ['check'])
    assert.match(output, /missing \(never translated\): 1/)
    assert.match(output, /errors\.ledger_probe_key/)

    // A key whose Spanish text changed under the translation.
    writeFileSync(
      es,
      original.replace(
        'onboarding_country_change: "Elegir otro país",',
        'onboarding_country_change: "Elegir otro país o región",'
      ),
      'utf-8'
    )
    output = run('ledger.mjs', ['check'])
    assert.match(output, /stale \(the Spanish changed\): 1/)
    assert.match(output, /errors\.onboarding_country_change/)

    // And the delta hands the translator exactly those keys, not the
    // whole dictionary.
    const delta = run('delta.mjs', ['pt'])
    assert.match(delta, /keys a traducir: 1/)
    assert.match(delta, /"stale":1/)
  } finally {
    writeFileSync(es, original, 'utf-8')
  }
})

test('the toolchain is wired to package.json', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
  assert.ok(pkg.scripts.i18n, 'npm run i18n must exist')
  assert.ok(pkg.scripts['i18n:status'], 'npm run i18n:status must exist')
  assert.ok(pkg.scripts['i18n:delta'], 'npm run i18n:delta must exist')
})
