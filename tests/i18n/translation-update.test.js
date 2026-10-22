// The incremental update, end to end.
//
//   node --test tests/i18n/translation-update.test.js
//
// The three things the owner can do to the Spanish dictionary, and what has
// to happen in the other languages for each one:
//   1. change the text of an existing key   -> the translation is stale
//   2. add a new key                        -> the translation is missing
//   3. remove a key nobody uses any more    -> the translation is a leftover
//
// And the failure that must never reach a screen: a translation whose
// placeholders no longer match the Spanish, which would render "{valor}"
// instead of the amount.
//
// The commands run against a SANDBOX: a throwaway copy of the dictionaries
// and the ledger. The commands write to the files they read, so running them
// against the repo would make this test race every other test that reads
// the same files.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { createSandbox } from './support/sandbox.mjs'

const ROOT = path.resolve(process.cwd())

/**
 * Writes a translated delta the way a translator would: the same shape as
 * the input chunk, with the Spanish replaced by the translation.
 */
function writeDelta(sandbox, lang, section, entries) {
  const dir = sandbox.path('scratch', `${lang}-delta-output`)
  // The directory is emptied first: in the real flow the agent translates
  // only the chunks of the current delta, and a leftover chunk from another
  // run must not be applied on top.
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, `${section}.json`),
    JSON.stringify({ section, part: 1, parts: 1, entries }, null, 2),
    'utf-8'
  )
}

test('scenario 1: the text of an existing key changed', async () => {
  const sandbox = createSandbox()
  const original = sandbox.read('es')

  try {
    sandbox.write(
      'es',
      original.replace(
        'onboarding_country_change: "Elegir otro país",',
        'onboarding_country_change: "Elegir otro país o región",'
      )
    )

    // The ledger sees the Spanish moved under the translation.
    const check = sandbox.run('ledger.mjs', ['check'])
    assert.match(check, /stale \(the Spanish changed\): 1/)
    assert.match(check, /errors\.onboarding_country_change/)

    // The delta hands the translator exactly that key, not the dictionary.
    sandbox.run('delta.mjs', ['pt'])
    const delta = JSON.parse(
      readFileSync(sandbox.path('scratch/pt-delta.json'), 'utf-8')
    )
    assert.equal(delta.total, 1)
    assert.match(JSON.stringify(delta.reasons), /stale/)

    // The translator answers.
    writeDelta(sandbox, 'pt', 'errors', {
      onboarding_country_change: { es: 'Escolher outro país ou região', ph: [] },
    })

    // The apply puts it in the dictionary.
    const applied = sandbox.run('apply-delta.mjs', ['pt'])
    assert.match(applied, /claves actualizadas: 1/)

    const pt = await sandbox.load('pt')
    assert.equal(pt.errors.onboarding_country_change, 'Escolher outro país ou região')
  } finally {
    sandbox.cleanup()
  }
})

test('scenario 2: a new key appeared', async () => {
  const sandbox = createSandbox()
  const original = sandbox.read('es')

  try {
    sandbox.write(
      'es',
      original.replace(
        /^export const errors = \{/m,
        'export const errors = {\n  update_probe_new_key: "Sonda de update",'
      )
    )

    const check = sandbox.run('ledger.mjs', ['check'])
    assert.match(check, /missing \(never translated\): 1/)

    sandbox.run('delta.mjs', ['pt'])
    const delta = JSON.parse(
      readFileSync(sandbox.path('scratch/pt-delta.json'), 'utf-8')
    )
    assert.equal(delta.total, 1)
    assert.match(JSON.stringify(delta.reasons), /missing/)

    writeDelta(sandbox, 'pt', 'errors', {
      update_probe_new_key: { es: 'Sonda de update', ph: [] },
    })

    const applied = sandbox.run('apply-delta.mjs', ['pt'])
    assert.match(applied, /claves actualizadas: 1/)

    const pt = await sandbox.load('pt')
    assert.equal(pt.errors.update_probe_new_key, 'Sonda de update')
  } finally {
    sandbox.cleanup()
  }
})

test('scenario 3: a key was removed', async () => {
  const sandbox = createSandbox()
  const original = sandbox.read('es')
  const ptBefore = await sandbox.load('pt')
  assert.ok(
    ptBefore.errors.onboarding_country_change,
    'the key must exist before it is removed'
  )

  try {
    // The key is gone from the Spanish, and the translation has to go with
    // it. The pattern does not depend on the line ending: the file may be
    // CRLF.
    sandbox.write(
      'es',
      original.replace(/^ {2}onboarding_country_change: "Elegir otro país",\r?\n/m, '')
    )

    const check = sandbox.run('ledger.mjs', ['check'])
    assert.match(check, /extra \(the key is gone from es\.ts\): 1/)

    // The delta reports the removal.
    sandbox.run('delta.mjs', ['pt'])
    const delta = JSON.parse(
      readFileSync(sandbox.path('scratch/pt-delta.json'), 'utf-8')
    )
    assert.ok(
      delta.removed.includes('errors.onboarding_country_change'),
      'the delta must list the removed key'
    )

    // Nothing to translate for it, but the apply removes it.
    writeDelta(sandbox, 'pt', 'errors', {})
    const applied = sandbox.run('apply-delta.mjs', ['pt'])
    assert.match(applied, /claves eliminadas:\s+1/)

    const pt = await sandbox.load('pt')
    assert.equal(
      pt.errors.onboarding_country_change,
      undefined,
      'the removed key must be gone from the translation'
    )
  } finally {
    sandbox.cleanup()
  }
})

test('the apply refuses a translation with broken placeholders', () => {
  // The Spanish says {monto}; a translation that says {valor} would render
  // the braces on screen. The apply must refuse and write nothing.
  const sandbox = createSandbox()
  const original = sandbox.read('es')

  try {
    sandbox.write(
      'es',
      original.replace(
        'onboarding_country_change: "Elegir otro país",',
        'onboarding_country_change: "Elegir otro país: {monto}",'
      )
    )
    sandbox.run('delta.mjs', ['pt'])
    writeDelta(sandbox, 'pt', 'errors', {
      onboarding_country_change: { es: 'Escolher outro país: {valor}', ph: [] },
    })

    let refused = false
    try {
      sandbox.run('apply-delta.mjs', ['pt'])
    } catch (error) {
      refused = true
      assert.equal(error.status, 1)
      assert.match(error.stderr, /PLACEHOLDER MISMATCH/)
    }
    assert.ok(refused, 'the apply must refuse a broken translation')

    // And the dictionary was not touched: it keeps the old translation.
    assert.match(
      sandbox.read('pt'),
      /onboarding_country_change: "Escolher outro país",/,
      'the dictionary must keep the old translation'
    )
  } finally {
    sandbox.cleanup()
  }
})

test('an empty delta leaves the dictionary byte for byte the same', () => {
  // The apply rewrites the whole file. If its escaping did not round-trip,
  // an empty delta would corrupt the file: a quote would become \"\" and a
  // backslash would double.
  const sandbox = createSandbox()
  const before = sandbox.read('pt')

  try {
    writeDelta(sandbox, 'pt', 'errors', {})
    sandbox.run('apply-delta.mjs', ['pt'])

    const after = sandbox.read('pt')
    assert.equal(
      after.replace(/\r\n/g, '\n'),
      before.replace(/\r\n/g, '\n'),
      'an empty delta must not change the dictionary'
    )
  } finally {
    sandbox.cleanup()
  }
})

test('the update cycle ends with a ledger that says nothing is pending', () => {
  // The full cycle, for every language: the owner changed the Spanish, each
  // language gets its own delta, each translation is applied, and the ledger
  // records the result.
  const sandbox = createSandbox()
  const original = sandbox.read('es')

  try {
    sandbox.write(
      'es',
      original.replace(
        /^export const errors = \{/m,
        'export const errors = {\n  cycle_probe_key: "Sonda del ciclo",'
      )
    )

    for (const [lang, translation] of [
      ['en', 'Cycle probe'],
      ['pt', 'Sonda do ciclo'],
    ]) {
      sandbox.run('delta.mjs', [lang])
      writeDelta(sandbox, lang, 'errors', {
        cycle_probe_key: { es: translation, ph: [] },
      })
      sandbox.run('apply-delta.mjs', [lang])
    }

    // The last step of the cycle: record the new state. Without it, the
    // next cycle would see the whole thing as pending again.
    sandbox.run('ledger.mjs', ['build'])

    const check = sandbox.run('ledger.mjs', ['check'])
    assert.match(check, /missing \(never translated\): 0/)
    assert.match(check, /stale \(the Spanish changed\): 0/)
  } finally {
    sandbox.cleanup()
  }
})

test('the apply keeps the mirror in the same order as the master', () => {
  // A translation is the MIRROR of the master: the same keys in the same
  // order. Without this, a new key lands at the end of its section and the
  // two files stop lining up, which makes every diff noisier.
  const sandbox = createSandbox()
  const original = sandbox.read('es')

  try {
    // The new key goes in the MIDDLE of the section, not at the end.
    sandbox.write(
      'es',
      original.replace(
        /^( {2}onboarding_country_cta: "Continuar",\r?\n)/m,
        '$1  mirror_order_probe: "Sonda de orden",\n'
      )
    )
    sandbox.run('delta.mjs', ['pt'])
    writeDelta(sandbox, 'pt', 'errors', {
      mirror_order_probe: { es: 'Sonda de ordem', ph: [] },
    })
    sandbox.run('apply-delta.mjs', ['pt'])

    const pt = sandbox.read('pt')
    const lines = pt.split(/\r?\n/)
    const cta = lines.findIndex((l) => l.includes('onboarding_country_cta:'))
    const probe = lines.findIndex((l) => l.includes('mirror_order_probe:'))
    const change = lines.findIndex((l) => l.includes('onboarding_country_change:'))

    assert.ok(probe > cta, 'the new key must come after the one before it')
    assert.ok(probe < change, 'the new key must come before the one after it')
  } finally {
    sandbox.cleanup()
  }
})

test('the apply keeps the header of the dictionary', () => {
  // The header is the only place the file says what it is. Replacing it
  // with a generic one throws that away.
  const sandbox = createSandbox()
  const before = sandbox.read('pt')

  try {
    writeDelta(sandbox, 'pt', 'errors', {})
    sandbox.run('apply-delta.mjs', ['pt'])

    const after = sandbox.read('pt')
    const headerOf = (text) => text.slice(0, text.search(/^export const /m))
    assert.equal(headerOf(after), headerOf(before), 'the header must not change')
  } finally {
    sandbox.cleanup()
  }
})

test('the toolchain is wired to package.json', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
  assert.ok(pkg.scripts['i18n:apply-delta'], 'npm run i18n:apply-delta must exist')
})
