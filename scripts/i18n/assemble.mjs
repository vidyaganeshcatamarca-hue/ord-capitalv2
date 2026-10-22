// Assemble src/locales/<target>.ts from the translated chunks.
//
// The chunks are the translation work; this file is the assembly. It
// validates every chunk against the Spanish source BEFORE emitting:
// same keys, same order, same placeholders, no empty values. A chunk that
// does not pass stops the build.
//
//   node scripts/i18n/assemble.mjs [target]
//
// Output: src/locales/<target>.ts
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { readDictionary, placeholders } from './lib/dictionary.mjs'
import path from 'node:path'

const ROOT = path.resolve('.')

/**
 * The target language of this run. The SOURCE dictionary is always Spanish:
 * it is the master one, and every other language is a mirror of it.
 */
const SOURCE_LANG = 'es'
const TARGET_LANG = process.argv[2] ?? 'en'

const INPUT = path.join(ROOT, `scratch/${TARGET_LANG}-input`)
const OUTPUT = path.join(ROOT, `scratch/${TARGET_LANG}-output`)
const TARGET = path.join(ROOT, `src/locales/${TARGET_LANG}.ts`)

const es = readDictionary(path.join(ROOT, `src/locales/${SOURCE_LANG}.ts`))

// ── Load the chunks ────────────────────────────────────────────────────
const chunkFiles = readdirSync(INPUT).filter((f) => f.endsWith('.json'))
const translated = new Map() // section -> Map(key -> english value)

for (const file of chunkFiles) {
  const chunk = JSON.parse(readFileSync(path.join(INPUT, file), 'utf-8'))
  const outPath = path.join(OUTPUT, file)
  if (!existsSync(outPath)) {
    console.error(`MISSING CHUNK OUTPUT: ${file}`)
    process.exit(1)
  }
  const translatedChunk = JSON.parse(readFileSync(outPath, 'utf-8'))

  if (translatedChunk.section !== chunk.section) {
    console.error(`SECTION MISMATCH in ${file}`)
    process.exit(1)
  }

  const esEntries = es[chunk.section]
  if (!esEntries) {
    console.error(`UNKNOWN SECTION in ${file}: ${chunk.section}`)
    process.exit(1)
  }

  const inputKeys = Object.keys(chunk.entries)
  const outputKeys = Object.keys(translatedChunk.entries)
  if (inputKeys.join('|') !== outputKeys.join('|')) {
    console.error(`KEY SET MISMATCH in ${file}`)
    const missing = inputKeys.filter((k) => !outputKeys.includes(k))
    const extra = outputKeys.filter((k) => !inputKeys.includes(k))
    console.error(`  missing: ${missing.slice(0, 20).join(', ')}`)
    console.error(`  extra:   ${extra.slice(0, 20).join(', ')}`)
    process.exit(1)
  }

  const values = new Map()
  for (const key of inputKeys) {
    const enValue = translatedChunk.entries[key].es
    const esValue = esEntries[key]

    if (typeof enValue !== 'string') {
      console.error(`NON-STRING VALUE in ${file}: ${chunk.section}.${key}`)
      process.exit(1)
    }
    if (esValue === undefined) {
      console.error(`KEY NOT IN es.ts: ${chunk.section}.${key}`)
      process.exit(1)
    }
    // An empty Spanish value (a tour step with no "how to", for instance) is
    // empty in English too: the translators were told not to invent content.
    // An empty English value over a NON-empty Spanish one is a real gap.
    if (!enValue.trim() && esValue.trim()) {
      console.error(`EMPTY VALUE in ${file}: ${chunk.section}.${key}`)
      process.exit(1)
    }

    const esPh = placeholders(esValue)
    const enPh = placeholders(enValue)
    if (esPh.join('|') !== enPh.join('|')) {
      console.error(`PLACEHOLDER MISMATCH in ${file}: ${chunk.section}.${key}`)
      console.error(`  es: [${esPh.join(', ')}]`)
      console.error(`  en: [${enPh.join(', ')}]`)
      process.exit(1)
    }

    values.set(key, enValue)
  }

  if (!translated.has(chunk.section)) translated.set(chunk.section, new Map())
  const sectionMap = translated.get(chunk.section)
  for (const [key, value] of values) {
    if (sectionMap.has(key)) {
      console.error(`DUPLICATE KEY across chunks: ${chunk.section}.${key}`)
      process.exit(1)
    }
    sectionMap.set(key, value)
  }
}

// ── Every Spanish key must be covered ─────────────────────────────────
const problems = []
for (const [section, entries] of Object.entries(es)) {
  const sectionMap = translated.get(section)
  if (!sectionMap) {
    problems.push(`MISSING SECTION: ${section}`)
    continue
  }
  for (const key of Object.keys(entries)) {
    if (!sectionMap.has(key)) problems.push(`MISSING KEY: ${section}.${key}`)
  }
}
if (problems.length) {
  console.error(`INCOMPLETE TRANSLATION: ${problems.length} problems`)
  console.error(problems.slice(0, 40).join('\n'))
  process.exit(1)
}

// ── Emit the module ───────────────────────────────────────────────────
// The section order mirrors es.ts so the two dictionaries resolve the
// duplicated keys the same way: `t()` iterates the sections in the order
// the module declares them, and the first match wins.
const esOrder = []
{
  const source = readFileSync(path.join(ROOT, `src/locales/${SOURCE_LANG}.ts`), 'utf-8')
  const declRe = /export const (\w+)\s*=\s*\{/g
  let m
  while ((m = declRe.exec(source)) !== null) esOrder.push(m[1])
}

// A character that cannot appear in the extracted values, used to mark the
// escaped quotes while they are being unescaped.
const SENTINEL = ''

/**
 * Escapes a value for a double-quoted TS string literal.
 *
 * The extracted values carry the RAW source text: a quote inside the
 * string is written as backslash-quote, and a literal backslash as two
 * backslashes. The emitter has to undo that one level, otherwise the
 * output would render a visible backslash where the Spanish dictionary
 * renders a clean quote.
 *
 * `es.ts` writes `"¿Archivar \"{nombre}\"?"`, whose runtime value is
 * `¿Archivar "{nombre}"?`. Emitting the raw text unchanged would produce
 * `"¿Archivar \\"{nombre}\\"?"`, which renders as `¿Archivar \"{nombre}\"?`.
 */
function tsString(value) {
  const raw = String(value)
    .replace(/\\"/g, SENTINEL)
    .replace(/\\\\/g, '\\')
    .replace(new RegExp(SENTINEL, 'g'), '\\"')
  return '"' + raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** A key needs quoting when it is not a plain identifier. */
function tsKey(key) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : "'" + key.replace(/'/g, "\\'") + "'"
}

const out = []
out.push('// locales/' + TARGET_LANG + '.ts')
out.push('// ============================================')
out.push('// ' + (TARGET_LANG === 'en' ? 'English' : TARGET_LANG.toUpperCase()) + ' dictionary — the mirror of `' + SOURCE_LANG + '.ts`.')
out.push('// ============================================')
out.push('//')
out.push('// Every key of the Spanish dictionary exists here, with the same')
out.push('// placeholders in the same order. A key added to `es.ts` without a')
out.push('// counterpart here simply falls back to Spanish at runtime, so this')
out.push('// dictionary can lag behind without breaking the UI.')
out.push('//')
out.push('// The section order mirrors `es.ts` on purpose: `t()` resolves a')
out.push('// duplicated key against the first section that declares it, and the')
out.push('// ES module namespace orders its exports alphabetically. Keeping the')
out.push('// same order keeps both languages pointing at the same string.')
out.push('')

let total = 0
for (const section of esOrder) {
  const sectionMap = translated.get(section)
  const entries = Array.from(sectionMap.entries())
  out.push('export const ' + section + ' = {')
  for (const [key, value] of entries) {
    out.push('  ' + tsKey(key) + ': ' + tsString(value) + ',')
    total++
  }
  out.push('};')
  out.push('')
}

writeFileSync(TARGET, out.join('\n'), 'utf-8')
console.log('written: ' + TARGET)
console.log('sections: ' + esOrder.join(', '))
console.log('total keys: ' + total)
