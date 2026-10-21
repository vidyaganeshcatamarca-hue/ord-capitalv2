// The translation ledger: what each language owes, and against which Spanish.
//
//   node scripts/i18n/ledger.mjs [build|check]
//
// The problem this solves: a dictionary file only holds the TRANSLATION. When
// the Spanish text of a key changes, there is nothing in the target file that
// says the translation is now out of date. The only way to notice is to read
// both files side by side and understand Spanish.
//
// The ledger closes that gap. For every key of every language it records the
// Spanish text the translation was made from. When the Spanish changes, the
// ledger's copy no longer matches, and the key is reported as STALE: the
// translation exists, but it may no longer say the same thing.
//
//   build  rewrites the ledger from the current dictionaries
//   check  compares the dictionaries against the ledger and reports drift
//
// The ledger lives in the repo (i18n/ledger.json) because it is a record of
// the work, not a build artifact: without it in version control, the next
// person cannot tell which translations are current.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, 'src/locales')
const LEDGER = path.join(ROOT, 'i18n/ledger.json')
const SOURCE_LANG = 'es'
const MODE = process.argv[2] ?? 'check'

/** Reads a locale dictionary into { section: { key: value } }. */
function readDictionary(file) {
  const source = readFileSync(file, 'utf-8')
  const sections = {}
  const declRe = /export const (\w+)\s*=\s*\{/g
  let m
  while ((m = declRe.exec(source)) !== null) {
    const bodyStart = m.index + m[0].length
    let depth = 1
    let j = bodyStart
    while (j < source.length && depth > 0) {
      const ch = source[j]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      j++
    }
    const body = source.slice(bodyStart, j - 1)
    const entries = {}
    const kv = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(['"`])((?:[^\\]|\\.)*?)\2\s*,?/gm
    let k
    while ((k = kv.exec(body)) !== null) entries[k[1]] = k[3]
    const dotted = /^\s*('[^']+')\s*:\s*(['"`])((?:[^\\]|\\.)*?)\2\s*,?/gm
    let d
    while ((d = dotted.exec(body)) !== null) entries[d[1].slice(1, -1)] = d[3]
    sections[m[1]] = entries
  }
  return sections
}

const placeholders = (value) => [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1])

const es = readDictionary(path.join(SRC, `${SOURCE_LANG}.ts`))

/** The languages the app ships. */
function shippedLanguages() {
  const { SUPPORTED } = { SUPPORTED: ['en', 'pt'] }
  return SUPPORTED
}

if (MODE === 'build') {
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

  const missing = []
  const stale = []
  const drifted = []
  const changed = []

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

  const extra = Object.keys(recorded).filter((id) => {
    // Keys with a dot in their name ('home.step3.title') must not be split on
    // it: the section is the part before the FIRST dot, and the key is
    // everything after it.
    const dot = id.indexOf('.')
    if (dot < 0) return true
    const section = id.slice(0, dot)
    const key = id.slice(dot + 1)
    return !(section in es) || !(key in es[section])
  })

  console.log(`=== ${lang} ===`)
  console.log(`  missing (never translated): ${missing.length}`)
  console.log(`  stale (the Spanish changed): ${stale.length}`)
  console.log(`  drifted (placeholder mismatch): ${drifted.length}`)
  console.log(`  changed (translated since the ledger): ${changed.length}`)
  if (missing.length) console.log(`    ${missing.slice(0, 12).join(', ')}`)
  if (stale.length) console.log(`    ${stale.slice(0, 12).join(', ')}`)
  if (drifted.length) console.log(`    ${drifted.slice(0, 12).join(', ')}`)
  if (extra.length) console.log(`  extra (the key is gone from es.ts): ${extra.length}`)
  console.log('')
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
