// The pipeline that translates a language from scratch.
//
//   node --test tests/i18n/translate-pipeline.test.js
//
// This is the path the i18n-translate skill prescribes: extract the master,
// split it into chunks, translate, assemble. It runs against a SANDBOX.
//
// It protects two things that are expensive to get wrong:
//   1. the assembled dictionary is a true MIRROR of the master: same keys,
//      same order, same placeholders
//   2. every script in scripts/i18n/ at least RUNS
//
// The second one is not academic: a duplicated import made `assemble.mjs`
// fail to parse, and it was only found by actually running it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { createSandbox } from './support/sandbox.mjs'

const ROOT = path.resolve(process.cwd())
const LANG = 'xx' // a language that does not exist

const lib = await import(
  pathToFileURL(path.join(ROOT, 'scripts/i18n/lib/dictionary.mjs')).href
)

test('every script of the toolchain runs', () => {
  // A script with a syntax error never gets to its own error message: it
  // dies on the import. That is a failure mode that no test caught until
  // the pipeline was actually run.
  const scripts = readdirSync(path.join(ROOT, 'scripts/i18n')).filter(
    (f) => f.endsWith('.mjs') && f !== 'index.mjs'
  )
  assert.ok(scripts.length >= 8, `the toolchain has ${scripts.length} scripts`)

  const sandbox = createSandbox()
  try {
    for (const script of scripts) {
      let stderr = ''
      try {
        sandbox.run(script, [])
      } catch (error) {
        stderr = String(error.stderr ?? '')
      }
      assert.ok(
        !/SyntaxError|Identifier .* has already been declared/.test(stderr),
        `${script} does not parse:\n${stderr.split('\n').slice(0, 4).join('\n')}`
      )
    }
  } finally {
    sandbox.cleanup()
  }
})

test('the pipeline turns the master into a translated dictionary', () => {
  const sandbox = createSandbox()

  try {
    // 1. Extract the master.
    sandbox.run('manifest.mjs', ['extract', LANG])
    const manifest = JSON.parse(
      readFileSync(sandbox.path('scratch', `i18n-manifest-${LANG}.json`), 'utf-8')
    )
    assert.equal(Object.keys(manifest).length, 10, 'the master has ten sections')
    const totalKeys = Object.values(manifest).flatMap((s) => Object.values(s)).length
    assert.ok(totalKeys > 2000, `the master has ${totalKeys} keys`)

    // 2. Split it into chunks.
    sandbox.run('chunks.mjs', [LANG])
    const chunkDir = sandbox.path('scratch', `${LANG}-input`)
    const chunkFiles = readdirSync(chunkDir)
    assert.ok(chunkFiles.length > 0, 'the work was split into chunks')

    // The chunk shape is the one the translator brief promises.
    const chunk = JSON.parse(readFileSync(path.join(chunkDir, chunkFiles[0]), 'utf-8'))
    assert.ok(chunk.section, 'the chunk names its section')
    assert.ok(chunk.part >= 1 && chunk.parts >= 1, 'the chunk knows its part')
    assert.ok(chunk.entries, 'the chunk carries its entries')
    for (const entry of Object.values(chunk.entries)) {
      assert.equal(typeof entry.es, 'string', 'every entry has the Spanish text')
      assert.ok(Array.isArray(entry.ph), 'every entry has its placeholder list')
    }

    // 3. Translate: a mechanical translation is enough to exercise the
    //    pipeline. What is being tested is the plumbing, not the language.
    const outDir = sandbox.path('scratch', `${LANG}-output`)
    mkdirSync(outDir, { recursive: true })
    for (const file of chunkFiles) {
      const input = JSON.parse(readFileSync(path.join(chunkDir, file), 'utf-8'))
      const entries = {}
      for (const [key, value] of Object.entries(input.entries)) {
        entries[key] = { es: `XX ${value.es}`, ph: value.ph }
      }
      writeFileSync(
        path.join(outDir, file),
        JSON.stringify({ ...input, entries }, null, 2),
        'utf-8'
      )
    }

    // 4. Assemble.
    sandbox.run('assemble.mjs', [LANG])

    // 5. The dictionary is a mirror of the master: same sections, same
    //    order, same keys, same placeholders.
    const es = lib.readDictionary(sandbox.path('src/locales/es.ts'))
    const target = lib.readDictionary(sandbox.path('src/locales', `${LANG}.ts`))

    assert.equal(
      Object.keys(target).join('|'),
      Object.keys(es).join('|'),
      'the sections are in the same order as the master'
    )

    for (const [section, entries] of Object.entries(es)) {
      const targetEntries = target[section] ?? {}
      assert.equal(
        Object.keys(targetEntries).join('|'),
        Object.keys(entries).join('|'),
        `the keys of ${section} are the master's keys, in the master's order`
      )
      for (const [key, esValue] of Object.entries(entries)) {
        const value = targetEntries[key]
        assert.equal(typeof value, 'string', `${section}.${key} is missing`)
        assert.ok(value.startsWith('XX '), `${section}.${key} was not translated`)
        assert.equal(
          lib.placeholders(value).join('|'),
          lib.placeholders(esValue).join('|'),
          `${section}.${key} kept its placeholders`
        )
      }
    }
  } finally {
    sandbox.cleanup()
  }
})

test('the assembler refuses a chunk that breaks a placeholder', () => {
  // The assembler validates BEFORE writing. A chunk that renames a
  // placeholder has to stop the build, not reach the dictionary.
  const sandbox = createSandbox()

  try {
    sandbox.run('manifest.mjs', ['extract', LANG])
    sandbox.run('chunks.mjs', [LANG])
    const chunkDir = sandbox.path('scratch', `${LANG}-input`)
    const chunkFiles = readdirSync(chunkDir)
    const outDir = sandbox.path('scratch', `${LANG}-output`)
    mkdirSync(outDir, { recursive: true })

    for (const file of chunkFiles) {
      const input = JSON.parse(readFileSync(path.join(chunkDir, file), 'utf-8'))
      const entries = {}
      for (const [key, value] of Object.entries(input.entries)) {
        // Rename every placeholder: the assembler has to catch it.
        entries[key] = { es: value.es.replace(/\{(\w+)\}/g, '{renamed}'), ph: value.ph }
      }
      writeFileSync(
        path.join(outDir, file),
        JSON.stringify({ ...input, entries }, null, 2),
        'utf-8'
      )
    }

    let refused = false
    try {
      sandbox.run('assemble.mjs', [LANG])
    } catch (error) {
      refused = true
      assert.match(String(error.stderr ?? ''), /PLACEHOLDER/i)
    }
    assert.ok(refused, 'the assembler must refuse a broken chunk')

    // And nothing was written.
    const target = sandbox.path('src/locales', `${LANG}.ts`)
    assert.ok(
      !existsSync(target) || !readFileSync(target, 'utf-8').includes('renamed'),
      'the dictionary must not exist with broken placeholders'
    )
  } finally {
    sandbox.cleanup()
  }
})
