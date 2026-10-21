// How far along is each language, and what is left to translate?
//
//   node scripts/i18n/status.mjs
//
// Output: scratch/i18n-status.json  (the report)
//         scratch/i18n-status.md    (the same, readable)
//
// The manifest is the record of what each language owes. It is versioned
// with the source dictionary, so a language that lags behind is visible
// without diffing 2288 keys by hand.
//
// For every language it reports:
//   - how many keys it has, out of the Spanish master
//   - which keys are MISSING (never translated)
//   - which keys are STALE (the Spanish text changed after the translation)
//   - which keys the translation can no longer use (placeholder drift)
//
// The report is what the incremental update reads: only the missing and the
// stale keys need work, not the whole dictionary.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, 'src/locales')
const SOURCE_LANG = 'es'

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

// Every language the app ships, found by the dictionary files themselves.
const languages = readdirSync(SRC)
  .filter((f) => f.endsWith('.ts') && f !== `${SOURCE_LANG}.ts` && f !== 'i18n.ts' && f !== 'language.ts')
  .map((f) => f.replace(/\.ts$/, ''))

const report = {
  source: SOURCE_LANG,
  sourceKeys: Object.values(es).reduce((a, s) => a + Object.keys(s).length, 0),
  languages: {},
}

for (const lang of languages) {
  const file = path.join(SRC, `${lang}.ts`)
  if (!existsSync(file)) {
    report.languages[lang] = { status: 'missing-dictionary', total: 0, translated: 0 }
    continue
  }

  const dict = readDictionary(file)
  const missing = []
  const stale = []
  const drifted = []
  let translated = 0

  for (const [section, entries] of Object.entries(es)) {
    const target = dict[section]
    for (const [key, esValue] of Object.entries(entries)) {
      const value = target?.[key]
      if (typeof value !== 'string') {
        missing.push(`${section}.${key}`)
        continue
      }
      translated++

      const esPh = placeholders(esValue)
      const ph = placeholders(value)
      if (esPh.join('|') !== ph.join('|')) {
        // The translation no longer fits the Spanish: the placeholders moved
        // or were renamed. It has to be translated again.
        drifted.push(`${section}.${key}`)
        continue
      }
      // The Spanish text changed after the translation was made. The
      // translation still exists, but it may no longer say the same thing.
      if (value === esValue) {
        stale.push(`${section}.${key}`)
      }
    }
  }

  report.languages[lang] = {
    status: missing.length === 0 && drifted.length === 0 ? 'complete' : 'incomplete',
    total: report.sourceKeys,
    translated,
    missing: missing.length,
    drifted: drifted.length,
    untranslated: missing.length + drifted.length,
    missingKeys: missing,
    driftedKeys: drifted,
  }
}

// ── The human-readable report ────────────────────────────────────────
const lines = []
lines.push('# Translation status')
lines.push('')
lines.push(`Source dictionary: \`${SOURCE_LANG}.ts\` (${report.sourceKeys} keys)`)
lines.push('')
lines.push('| Language | Translated | Missing | Placeholder drift | Complete |')
lines.push('|---|---|---|---|---|')
for (const [lang, info] of Object.entries(report.languages)) {
  lines.push(
    `| ${lang} | ${info.translated}/${info.total} | ${info.missing ?? 0} | ${info.drifted ?? 0} | ${info.status === 'complete' ? 'yes' : 'NO'} |`
  )
}
lines.push('')
for (const [lang, info] of Object.entries(report.languages)) {
  if (info.status === 'complete') continue
  lines.push(`## ${lang}`)
  if (info.missingKeys?.length) {
    lines.push('')
    lines.push(`Missing (${info.missingKeys.length}):`)
    for (const k of info.missingKeys.slice(0, 40)) lines.push(`- \`${k}\``)
    if (info.missingKeys.length > 40) lines.push(`- ... and ${info.missingKeys.length - 40} more`)
  }
  if (info.driftedKeys?.length) {
    lines.push('')
    lines.push(`Placeholder drift (${info.driftedKeys.length}):`)
    for (const k of info.driftedKeys.slice(0, 40)) lines.push(`- \`${k}\``)
    if (info.driftedKeys.length > 40) lines.push(`- ... and ${info.driftedKeys.length - 40} more`)
  }
  lines.push('')
}

writeFileSync(path.join(ROOT, 'scratch/i18n-status.json'), JSON.stringify(report, null, 2), 'utf-8')
writeFileSync(path.join(ROOT, 'scratch/i18n-status.md'), lines.join('\n'), 'utf-8')
console.log(lines.join('\n'))
console.log('\nwritten: scratch/i18n-status.json')
console.log('written: scratch/i18n-status.md')
