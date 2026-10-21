// Apply the agreed corrections from the refutation round.
//
// Two reviewers reported findings on the uncertain keys; the orchestrator
// arbitrated the disagreements. This script applies the agreed result and
// re-validates the whole dictionary before and after.
//
//   node scripts/i18n/apply-fixes.mjs <lang> [fixes-file]
//
// It edits `src/locales/<lang>.ts` in place. A correction that would change
// the placeholders of its key is refused.
//
// The corrections live in a separate file so that the script itself stays
// language-independent:
//   scratch/fixes-<lang>.mjs  ->  export default [ ...fixes ]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve('.')
const TARGET_LANG = process.argv[2] ?? 'en'
const FIXES_FILE = process.argv[3] ?? path.resolve(`scratch/fixes-${TARGET_LANG}.mjs`)

const ES = path.join(ROOT, 'src/locales/es.ts')
const TARGET = path.join(ROOT, `src/locales/${TARGET_LANG}.ts`)

const { default: FIXES } = await import(pathToFileURL(FIXES_FILE).href)

const placeholders = (value) => [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1])

/** Reads a dictionary file into { section: { key: value } }. */
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

const es = readDictionary(ES)
const en = readDictionary(TARGET)

// ── Validate the fixes before touching anything ───────────────────────
const problems = []
for (const fix of FIXES) {
  const esValue = es[fix.section]?.[fix.key]
  const enValue = en[fix.section]?.[fix.key]
  if (esValue === undefined) problems.push(`NOT IN es.ts: ${fix.section}.${fix.key}`)
  if (enValue === undefined) problems.push(`NOT IN ${TARGET_LANG}.ts: ${fix.section}.${fix.key}`)
  if (esValue === undefined || enValue === undefined) continue

  const esPh = placeholders(esValue).join('|')
  const enPh = placeholders(fix.value).join('|')
  if (esPh !== enPh) {
    problems.push(
      `PLACEHOLDER MISMATCH in ${fix.section}.${fix.key}\n    es: [${esPh}]\n    new: [${enPh}]`
    )
  }
  if (!fix.value.trim()) problems.push(`EMPTY VALUE: ${fix.section}.${fix.key}`)
}

if (problems.length) {
  console.error('REFUSING TO APPLY — the fixes would break the dictionary:')
  console.error(problems.join('\n'))
  process.exit(1)
}

// ── Apply ─────────────────────────────────────────────────────────────
let source = readFileSync(TARGET, 'utf-8')
let applied = 0

for (const fix of FIXES) {
  const current = en[fix.section][fix.key]
  if (current === fix.value) {
    console.log(`SKIP (already applied): ${fix.section}.${fix.key}`)
    continue
  }
  const escaped = fix.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const pattern = new RegExp(
    `(\\n\\s*${fix.key}\\s*:\\s*)"${current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
    'g'
  )
  if (!pattern.test(source)) {
    console.error(`NOT FOUND in the file: ${fix.section}.${fix.key}`)
    process.exit(1)
  }
  source = source.replace(pattern, `$1"${escaped}"`)
  applied++
  console.log(`FIXED [${fix.reportedBy}]: ${fix.section}.${fix.key}`)
  console.log(`       ${fix.why}`)
}

writeFileSync(TARGET, source, 'utf-8')
console.log(`\n${applied} corrections applied to ${TARGET}`)

// ── Re-validate the whole dictionary ──────────────────────────────────
const after = readDictionary(TARGET)
const failures = []
for (const [section, entries] of Object.entries(es)) {
  if (!after[section]) {
    failures.push(`MISSING SECTION: ${section}`)
    continue
  }
  for (const [key, esValue] of Object.entries(entries)) {
    const enValue = after[section][key]
    if (typeof enValue !== 'string') {
      failures.push(`MISSING KEY: ${section}.${key}`)
      continue
    }
    if (placeholders(esValue).join('|') !== placeholders(enValue).join('|')) {
      failures.push(`PLACEHOLDER MISMATCH: ${section}.${key}`)
    }
  }
}
for (const [section, entries] of Object.entries(after)) {
  if (!es[section]) {
    failures.push(`EXTRA SECTION: ${section}`)
    continue
  }
  for (const key of Object.keys(entries)) {
    if (!(key in es[section])) failures.push(`EXTRA KEY: ${section}.${key}`)
  }
}

if (failures.length) {
  console.error(`\nPOST-APPLY VALIDATION FAILED (${failures.length}):`)
  console.error(failures.slice(0, 30).join('\n'))
  process.exit(1)
}
const total = Object.values(after).reduce((a, o) => a + Object.keys(o).length, 0)
console.log(`\nOK: ${TARGET_LANG}.ts still matches es.ts (${total} keys)`)
