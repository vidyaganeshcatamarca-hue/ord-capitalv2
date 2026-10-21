// Extract the Spanish dictionary into a JSON manifest that a translator can
// work on, and validate any English dictionary against it.
//
//   node scripts/i18n/manifest.mjs extract   -> scratch/i18n-manifest.json
//   node scripts/i18n/manifest.mjs verify    -> validates src/locales/en.ts
//
// The manifest is the contract between "what exists" and "what must be
// translated": same keys, same placeholders, same order.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve('src/locales')

/** Reads a locale dictionary and returns { section: { key: value } }. */
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
    while ((k = kv.exec(body)) !== null) {
      entries[k[1]] = k[3]
    }
    // Keys with dots are quoted in the source, so the plain-name regex above
    // misses them. Recover them with a second pass.
    const dotted = /^\s*('[^']+')\s*:\s*(['"`])((?:[^\\]|\\.)*?)\2\s*,?/gm
    let d
    while ((d = dotted.exec(body)) !== null) {
      entries[d[1].slice(1, -1)] = d[3]
    }
    sections[m[1]] = entries
  }
  return sections
}

function placeholders(value) {
  return [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1])
}

/**
 * Undoes ONE level of TypeScript literal escaping.
 *
 * The extractor reads the raw source text, so a quote inside a string comes
 * out as backslash-quote. The chunk files are JSON, so that backslash has
 * to be decoded before the value is compared or written back: the runtime
 * value of `"¿Archivar \"{nombre}\"?"` is `¿Archivar "{nombre}"?`, and a
 * chunk that carries the backslash would make the English dictionary show
 * a visible backslash where the Spanish one shows a clean quote.
 */
function unescapeLiteral(raw) {
  return String(raw).replace(/\\(["'\\`])/g, '$1')
}

const mode = process.argv[2] ?? 'extract'

/**
 * The language of the SOURCE dictionary (the master one) and the language of
 * the TARGET dictionary being built. The source stays Spanish; the target is
 * whatever language the next delivery adds.
 *
 *   node scripts/i18n/manifest.mjs extract [target]   -> scratch/i18n-manifest-<target>.json
 *   node scripts/i18n/manifest.mjs verify  [target]
 */
const SOURCE_LANG = 'es'
const TARGET_LANG = process.argv[3] ?? 'en'

if (mode === 'extract') {
  const es = readDictionary(path.join(SRC, `${SOURCE_LANG}.ts`))
  const manifest = {}
  let total = 0
  for (const [section, entries] of Object.entries(es)) {
    manifest[section] = {}
    for (const [key, value] of Object.entries(entries)) {
      manifest[section][key] = { es: unescapeLiteral(value), ph: placeholders(value) }
      total++
    }
  }
  const out = path.resolve(`scratch/i18n-manifest-${TARGET_LANG}.json`)
  writeFileSync(out, JSON.stringify(manifest, null, 2), 'utf-8')
  console.log(`manifest written: ${out}`)
  console.log(`source: ${SOURCE_LANG}.ts | target: ${TARGET_LANG}`)
  console.log(`sections: ${Object.keys(manifest).join(', ')}`)
  console.log(`total keys: ${total}`)
  const withPh = Object.values(manifest).flatMap((s) => Object.values(s)).filter((v) => v.ph.length)
  console.log(`keys with placeholders: ${withPh.length}`)
} else if (mode === 'verify') {
  const targetFile = path.join(SRC, `${TARGET_LANG}.ts`)
  if (!existsSync(targetFile)) {
    console.log(`${TARGET_LANG}.ts does not exist yet`)
    process.exit(1)
  }
  const es = readDictionary(path.join(SRC, `${SOURCE_LANG}.ts`))
  const en = readDictionary(targetFile)

  const problems = []
  for (const [section, entries] of Object.entries(es)) {
    if (!en[section]) {
      problems.push(`MISSING SECTION: ${section}`)
      continue
    }
    for (const [key, esValue] of Object.entries(entries)) {
      const enValue = en[section][key]
      if (typeof enValue !== 'string') {
        problems.push(`MISSING KEY: ${section}.${key}`)
        continue
      }
      const esPh = placeholders(esValue).join('|')
      const enPh = placeholders(enValue).join('|')
      if (esPh !== enPh) {
        problems.push(`PLACEHOLDER MISMATCH: ${section}.${key}\n    es: [${esPh}]\n    en: [${enPh}]`)
      }
      // An empty Spanish value (a tour step with no "how to") is empty in
      // English too. Only a value that lost its content is a problem.
      if (!enValue.trim() && esValue.trim()) {
        problems.push(`EMPTY VALUE: ${section}.${key}`)
      }
    }
  }
  for (const [section, entries] of Object.entries(en)) {
    if (!es[section]) {
      problems.push(`EXTRA SECTION: ${section}`)
      continue
    }
    for (const key of Object.keys(entries)) {
      if (!(key in es[section])) problems.push(`EXTRA KEY: ${section}.${key}`)
    }
  }
  if (problems.length) {
    console.log(`FAIL: ${problems.length} problems`)
    console.log(problems.slice(0, 60).join('\n'))
    process.exit(1)
  }
  const total = Object.values(en).reduce((a, o) => a + Object.keys(o).length, 0)
  console.log(`OK: ${TARGET_LANG}.ts matches ${SOURCE_LANG}.ts (${total} keys)`)
} else {
  console.log('usage: node scripts/i18n/manifest.mjs [extract|verify]')
  process.exit(1)
}
