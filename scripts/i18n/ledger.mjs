// The translation ledger: what the Spanish said when each translation was made.
//
//   node scripts/i18n/ledger.mjs check        what changed since the last translation
//   node scripts/i18n/ledger.mjs build        record the current state
//   node scripts/i18n/ledger.mjs build --force record it anyway, pending work and all
//
// Without this record, a change in the Spanish is invisible: the only way to
// know that a translation went stale is to read both files side by side and
// understand Spanish. The ledger answers that question without judgment.
//
// The ledger lives in the repo (i18n/ledger.json) because it is a record of
// the work, not a build artifact: without it in version control, the next
// person cannot tell which translations are current.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { readDictionary, placeholders } from './lib/dictionary.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, 'src/locales')
const LEDGER = path.join(ROOT, 'i18n/ledger.json')
const SOURCE_LANG = 'es'
const MODE = process.argv[2] ?? 'check'
const FORCE = process.argv.includes('--force')

const es = readDictionary(path.join(SRC, `${SOURCE_LANG}.ts`))

/** The languages the app ships. */
function shippedLanguages() {
  const { SUPPORTED } = { SUPPORTED: ['en', 'pt'] }
  return SUPPORTED
}

/**
 * What a language still owes, and what the ledger has that it should not.
 *
 * The same calculation serves two purposes: `check` prints it, and `build`
 * refuses to run when there is pending work, because building would record
 * the new Spanish as the base and the pending work would disappear.
 */
function assess(lang, dict, recorded) {
  const missing = []
  const stale = []
  const drifted = []
  const changed = []
  const extra = []

  for (const [section, entries] of Object.entries(es)) {
    for (const [key, esValue] of Object.entries(entries)) {
      const id = `${section}.${key}`
      const value = dict[section]?.[key]
      const entry = recorded[id]

      if (typeof value !== 'string') {
        missing.push(id)
        continue
      }
      if (!entry) {
        // Translated but never recorded: the ledger is older than the file.
        changed.push(id)
        continue
      }
      if (entry.from !== esValue) {
        // The Spanish moved under the translation.
        stale.push(id)
      }
      if (entry.to !== value) {
        // The translation itself changed since the ledger was written.
        changed.push(id)
      }
      const esPh = placeholders(esValue)
      const ph = placeholders(value)
      if (esPh.join('|') !== ph.join('|')) {
        drifted.push(id)
      }
    }
  }

  for (const id of Object.keys(recorded)) {
    // Keys with a dot in their name ('home.step3.title') must not be split on
    // it: the section is the part before the FIRST dot, and the key is
    // everything after it.
    const dot = id.indexOf('.')
    if (dot < 0) {
      extra.push(id)
      continue
    }
    const section = id.slice(0, dot)
    const key = id.slice(dot + 1)
    if (!(section in es) || !(key in es[section])) extra.push(id)
  }

  return { missing, stale, drifted, changed, extra }
}

// ── build ─────────────────────────────────────────────────────────────
if (MODE === 'build') {
  const previous = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf-8')) : null

  // The guard: a language that already has a record cannot be rebuilt while
  // it still owes work, because the rebuild would record the new Spanish as
  // the base of a translation that was made from the old one. The pending
  // work would vanish and the change would never reach the other languages.
  if (previous && !FORCE) {
    const pending = []
    for (const lang of shippedLanguages()) {
      const recorded = previous.languages?.[lang]
      if (!recorded) {
        // A language with no record yet is being bootstrapped: there is
        // nothing to lose.
        continue
      }
      const file = path.join(SRC, `${lang}.ts`)
      if (!existsSync(file)) continue
      const result = assess(lang, readDictionary(file), recorded)
      const work = [...result.missing, ...result.stale, ...result.drifted]
      if (work.length) pending.push({ lang, work, result, extra: result.extra })
    }

    if (pending.length) {
      console.error('REFUSING TO BUILD — there is pending work that the rebuild would erase:')
      for (const p of pending) {
        // Decir CUAL es el motivo: 'missing' y 'stale' piden acciones distintas.
        // Antes decia 'not translated yet' para los tres casos, que era enganoso
        // cuando el diccionario ya tenia la traduccion y solo faltaba el registro.
        const parts = []
        if (p.result.missing.length) parts.push(`${p.result.missing.length} missing`)
        if (p.result.stale.length) parts.push(`${p.result.stale.length} stale`)
        if (p.result.drifted.length) parts.push(`${p.result.drifted.length} drifted`)
        console.error(`  ${p.lang}: ${parts.join(', ')}`)
        for (const id of p.work.slice(0, 12)) console.error(`    ${id}`)
        if (p.work.length > 12) console.error(`    ... and ${p.work.length - 12} more`)
      }
      console.error('')
      console.error('Translate the pending keys first:')
      console.error('  node scripts/i18n/delta.mjs <lang>')
      console.error('  node scripts/i18n/apply-delta.mjs <lang>')
      console.error('')
      console.error('If you decided NOT to translate them, build anyway with:')
      console.error('  node scripts/i18n/ledger.mjs build --force')
      process.exit(1)
    }
  }

  const ledger = {
    source: SOURCE_LANG,
    languages: {},
  }
  for (const lang of shippedLanguages()) {
    const file = path.join(SRC, `${lang}.ts`)
    if (!existsSync(file)) continue
    const dict = readDictionary(file)
    const entries = {}
    for (const [section, sectionEntries] of Object.entries(es)) {
      for (const [key, esValue] of Object.entries(sectionEntries)) {
        const value = dict[section]?.[key]
        if (typeof value !== 'string') continue
        entries[`${section}.${key}`] = {
          // The Spanish this translation was made from.
          from: esValue,
          // The translation itself, so a change in the target file is visible
          // in the ledger diff too.
          to: value,
        }
      }
    }
    ledger.languages[lang] = entries
  }
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2), 'utf-8')
  const counts = Object.entries(ledger.languages).map(
    ([lang, entries]) => `${lang}: ${Object.keys(entries).length}`
  )
  console.log(`written: ${LEDGER}`)
  console.log(counts.join(' | '))
  process.exit(0)
}

// ── check ─────────────────────────────────────────────────────────────
if (!existsSync(LEDGER)) {
  console.error(
    `No ledger at ${LEDGER}. Run: node scripts/i18n/ledger.mjs build`
  )
  process.exit(1)
}

const ledger = JSON.parse(readFileSync(LEDGER, 'utf-8'))
const problems = []

for (const lang of shippedLanguages()) {
  const file = path.join(SRC, `${lang}.ts`)
  if (!existsSync(file)) {
    problems.push(`${lang}: no dictionary file`)
    continue
  }
  const dict = readDictionary(file)
  const recorded = ledger.languages?.[lang] ?? {}
  const { missing, stale, drifted, changed, extra } = assess(lang, dict, recorded)

  console.log(`=== ${lang} ===`)
  console.log(`  missing (never translated): ${missing.length}`)
  console.log(`  stale (the Spanish changed): ${stale.length}`)
  console.log(`  drifted (placeholder mismatch): ${drifted.length}`)
  console.log(`  changed (translated since the ledger): ${changed.length}`)
  if (missing.length) console.log(`    ${missing.slice(0, 12).join(', ')}`)
  if (stale.length) console.log(`    ${stale.slice(0, 12).join(', ')}`)
  if (drifted.length) console.log(`    ${drifted.slice(0, 12).join(', ')}`)
  if (changed.length) console.log(`    ${changed.slice(0, 12).join(', ')}`)
  if (extra.length) console.log(`  extra (the key is gone from es.ts): ${extra.length}`)
  if (extra.length) console.log(`    ${extra.slice(0, 12).join(', ')}`)
  console.log('')
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
