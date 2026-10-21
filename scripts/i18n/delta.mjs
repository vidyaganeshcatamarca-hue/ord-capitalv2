// Build the translation work for ONE language, from what is already done.
//
//   node scripts/i18n/delta.mjs <lang>
//
// Output: scratch/<lang>-delta.json  (the keys to translate)
//         scratch/<lang>-delta-input/ (one chunk file per section, ready for
//                                       the translators)
//
// This is the incremental update: it NEVER hands the translators the whole
// dictionary. It reads the ledger, works out which keys are missing (never
// translated) or stale (the Spanish moved under the translation), and writes
// only those.
//
// The output is the same shape the translation pipeline already uses, so the
// chunks go straight to the translators and come back through the same
// assembler.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, 'src/locales')
const LEDGER = path.join(ROOT, 'i18n/ledger.json')
const SOURCE_LANG = 'es'
const TARGET_LANG = process.argv[2]

if (!TARGET_LANG) {
  console.error('usage: node scripts/i18n/delta.mjs <lang>')
  process.exit(1)
}

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

if (!existsSync(LEDGER)) {
  console.error(`No ledger at ${LEDGER}. Run: node scripts/i18n/ledger.mjs build`)
  process.exit(1)
}

const ledger = JSON.parse(readFileSync(LEDGER, 'utf-8'))
const es = readDictionary(path.join(SRC, `${SOURCE_LANG}.ts`))
const target = readDictionary(path.join(SRC, `${TARGET_LANG}.ts`))
const recorded = ledger.languages?.[TARGET_LANG] ?? {}

/** The keys that still need work, grouped by section. */
const work = new Map()

for (const [section, entries] of Object.entries(es)) {
  for (const [key, esValue] of Object.entries(entries)) {
    const id = `${section}.${key}`
    const value = target[section]?.[key]
    const entry = recorded[id]

    let reason = null
    if (typeof value !== 'string') {
      reason = 'missing'
    } else if (!entry) {
      reason = 'unrecorded'
    } else if (entry.from !== esValue) {
      reason = 'stale'
    } else {
      const esPh = placeholders(esValue)
      const ph = placeholders(value)
      if (esPh.join('|') !== ph.join('|')) reason = 'drifted'
    }
    if (!reason) continue

    if (!work.has(section)) work.set(section, [])
    work.get(section).push({
      key,
      es: esValue,
      ph: placeholders(esValue),
      reason,
      // For a stale key the translation is there but it was made from an
      // older Spanish. It travels along so the translator can decide whether
      // it still holds.
      previous: typeof value === 'string' ? value : undefined,
    })
  }
}

const total = Array.from(work.values()).reduce((a, list) => a + list.length, 0)

// ── The chunk files, in the shape the translators already know ───────
const OUT_DIR = path.join(ROOT, `scratch/${TARGET_LANG}-delta-input`)
rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const sections = []
for (const [section, items] of work) {
  const entries = {}
  for (const item of items) {
    entries[item.key] = { es: item.es, ph: item.ph }
  }
  const chunk = { section, part: 1, parts: 1, entries }
  writeFileSync(
    path.join(OUT_DIR, `${section}.json`),
    JSON.stringify(chunk, null, 2),
    'utf-8'
  )
  sections.push({ section, count: items.length, file: `${section}.json` })
}

const report = {
  target: TARGET_LANG,
  source: SOURCE_LANG,
  total,
  sections,
  reasons: total
    ? Array.from(work.values())
        .flat()
        .reduce((acc, item) => {
          acc[item.reason] = (acc[item.reason] ?? 0) + 1
          return acc
        }, {})
    : {},
}
writeFileSync(
  path.join(ROOT, `scratch/${TARGET_LANG}-delta.json`),
  JSON.stringify(report, null, 2),
  'utf-8'
)

console.log(`=== update incremental para '${TARGET_LANG}' ===`)
console.log(`keys a traducir: ${total}`)
if (total) {
  for (const s of sections) console.log(`  ${s.file}: ${s.count}`)
  console.log(`  razones: ${JSON.stringify(report.reasons)}`)
  console.log(`\nchunks listos en: scratch/${TARGET_LANG}-delta-input/`)
  console.log(`Para traducirlos: translate each chunk into scratch/${TARGET_LANG}-delta-output/`)
  console.log('  con el mismo formato: { section, part, parts, entries: { key: { es, ph } } }')
} else {
  console.log('  (nada pendiente: el idioma esta al dia)')
}
console.log(`\nwritten: scratch/${TARGET_LANG}-delta.json`)
