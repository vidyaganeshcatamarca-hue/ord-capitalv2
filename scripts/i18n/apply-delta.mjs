// Apply a translated delta to a language dictionary.
//
//   node scripts/i18n/apply-delta.mjs <lang> [delta-dir]
//
// The delta is a PARTIAL translation: only the keys that were new, that the
// Spanish moved under, or that were removed. This command applies it to the
// existing dictionary in place. It never rebuilds the dictionary from the
// delta alone, which would leave the file with only the translated keys.
//
// What it does, per key:
//   - a translated delta key REPLACES the value in the dictionary
//   - a key the Spanish removed is deleted from the dictionary
//   - a key the Spanish changed but nobody translated is left alone, and
//     reported, so nothing is silently lost
//
// It validates before writing:
//   - the placeholders of each translation match the Spanish, in name and order
//   - no translation is empty over a non-empty Spanish
//   - every key of the Spanish master is still present afterwards
//
// If anything fails, nothing is written.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {
  readDictionary,
  writeDictionary,
  sectionOrder,
  keyOrderOf,
  readHeader,
  placeholders,
} from './lib/dictionary.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, 'src/locales')
const SOURCE_LANG = 'es'
const TARGET_LANG = process.argv[2]

if (!TARGET_LANG) {
  console.error('usage: node scripts/i18n/apply-delta.mjs <lang> [delta-dir]')
  process.exit(1)
}

const DELTA_DIR = path.resolve(process.argv[3] ?? `scratch/${TARGET_LANG}-delta-output`)
const DELTA_REPORT = path.resolve(`scratch/${TARGET_LANG}-delta.json`)

if (!existsSync(DELTA_DIR)) {
  console.error(`No hay delta traducido en ${DELTA_DIR}`)
  console.error('Traducí los chunks de scratch/<lang>-delta-input/ a scratch/<lang>-delta-output/')
  process.exit(1)
}

const es = readDictionary(path.join(SRC, `${SOURCE_LANG}.ts`))
const targetFile = path.join(SRC, `${TARGET_LANG}.ts`)
const target = readDictionary(targetFile)

// ── Read the translated delta ─────────────────────────────────────────
// The delta REPORT is the whitelist: the apply only touches the keys the
// delta asked for. Without it, a leftover chunk from a previous run would
// be applied on top of the current one.
const translated = new Map() // "section.key" -> value
for (const file of readdirSync(DELTA_DIR).filter((f) => f.endsWith('.json'))) {
  const chunk = JSON.parse(readFileSync(path.join(DELTA_DIR, file), 'utf-8'))
  for (const [key, entry] of Object.entries(chunk.entries)) {
    translated.set(`${chunk.section}.${key}`, entry.es)
  }
}

// The delta report: what the delta promised to cover.
let report = null
if (existsSync(DELTA_REPORT)) report = JSON.parse(readFileSync(DELTA_REPORT, 'utf-8'))

const problems = []
const applied = []
const removed = []
const skipped = []

// Only the keys the report lists are in scope.
const inScope = report?.keys ? new Set(report.keys) : null
for (const [id, value] of translated) {
  if (inScope && !inScope.has(id)) {
    // A chunk from another run: not part of this delta.
    continue
  }
  const dot = id.indexOf('.')
  const section = id.slice(0, dot)
  const key = id.slice(dot + 1)

  const esValue = es[section]?.[key]
  if (esValue === undefined) {
    // The key was removed from the Spanish: the translation goes with it.
    if (target[section] && key in target[section]) {
      delete target[section][key]
      removed.push(id)
    }
    continue
  }

  if (typeof value !== 'string' || !value.trim()) {
    problems.push(`EMPTY: ${id}`)
    continue
  }
  const esPh = placeholders(esValue)
  const ph = placeholders(value)
  if (esPh.join('|') !== ph.join('|')) {
    problems.push(
      `PLACEHOLDER MISMATCH: ${id}\n    es: [${esPh.join(', ')}]\n    ${TARGET_LANG}: [${ph.join(', ')}]`
    )
    continue
  }
  if (!target[section]) target[section] = {}
  target[section][key] = value
  applied.push(id)
}

// ── The keys the Spanish removed ──────────────────────────────────────
// The removal is driven by the DELTA REPORT, not by the translated chunks: a
// removed key has nothing to translate, so it never appears in a chunk. The
// report is the only place that knows it was there.
if (report?.removed) {
  for (const id of report.removed) {
    const dot = id.indexOf('.')
    if (dot < 0) continue
    const section = id.slice(0, dot)
    const key = id.slice(dot + 1)
    if (target[section] && key in target[section]) {
      delete target[section][key]
      removed.push(id)
    }
  }
}

// ── The keys the delta promised to cover ──────────────────────────────
// Anything the delta listed and nobody translated stays as it was, and is
// reported: a stale translation is better than a missing one, but it must not
// pass unnoticed.
if (report?.keys) {
  for (const id of report.keys) {
    if (!translated.has(id) && !removed.includes(id)) skipped.push(id)
  }
}

// ── Every key of the Spanish master must survive ──────────────────────
for (const [section, entries] of Object.entries(es)) {
  for (const key of Object.keys(entries)) {
    if (!target[section] || !(key in target[section])) {
      problems.push(`MISSING AFTER APPLY: ${section}.${key}`)
    }
  }
}

if (problems.length) {
  console.error('REFUSING TO APPLY — the delta would break the dictionary:')
  console.error(problems.join('\n'))
  process.exit(1)
}

// ── Write it back ─────────────────────────────────────────────────────
// The header of the file being replaced is kept: it is the only place the
// file says what it is, and a generic replacement would throw that away.
const header = readHeader(targetFile)

const total = writeDictionary(
  targetFile,
  target,
  sectionOrder(path.join(SRC, `${SOURCE_LANG}.ts`)),
  header,
  // The master decides the order of the keys: a translation is the mirror
  // of the Spanish, key for key and in the same order. Without this, a new
  // key would land at the end of its section and the two files would stop
  // lining up.
  keyOrderOf(es)
)

console.log(`=== ${TARGET_LANG}: delta aplicado ===`)
console.log(`  claves actualizadas: ${applied.length}`)
if (applied.length) console.log(`    ${applied.slice(0, 10).join(', ')}`)
console.log(`  claves eliminadas:   ${removed.length}`)
if (removed.length) console.log(`    ${removed.slice(0, 10).join(', ')}`)
console.log(`  sin traducir (quedan viejas): ${skipped.length}`)
if (skipped.length) console.log(`    ${skipped.slice(0, 10).join(', ')}`)
console.log(`  total en el diccionario: ${total}`)
console.log(`\nwritten: ${targetFile}`)

if (skipped.length) {
  console.log(
    '\nLas claves sin traducir siguen con el texto viejo. Corré de nuevo el ciclo para completarlas.'
  )
}
