// The translation toolchain, in one place.
//
//   node scripts/i18n/status.mjs            how far along is every language
//   node scripts/i18n/ledger.mjs check      what changed since the last translation
//   node scripts/i18n/ledger.mjs build      record the current state
//   node scripts/i18n/delta.mjs <lang>      the keys that language still owes
//   node scripts/i18n/apply-delta.mjs <lang>  apply a translated delta to the dictionary
//   node scripts/i18n/assemble.mjs <lang>   build src/locales/<lang>.ts from the chunks
//
// The daily loop, when the Spanish dictionary changes:
//
//   1. node scripts/i18n/ledger.mjs check      see what changed
//   2. node scripts/i18n/delta.mjs <lang>      the keys that language still owes
//   3. translate the chunks in scratch/<lang>-delta-output/
//   4. node scripts/i18n/apply-delta.mjs <lang>  apply them to the dictionary
//   5. node scripts/i18n/ledger.mjs build      record the new translations
//   6. repeat for every other language
//
// Step 1 comes BEFORE step 5, and that order matters: `build` records the
// Spanish as the base of every translation, so building before translating
// would erase the record of what still needs work. The `build` command
// refuses to run while a language owes keys, for exactly that reason.
//
// Step 2 is the point of the whole thing: it hands the translator only the
// keys that are new or that the Spanish moved under, never the whole
// dictionary.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')

const LEDGER = path.join(ROOT, 'i18n/ledger.json')

/** The languages the app ships. */
function shippedLanguages() {
  const source = readFileSync(path.join(ROOT, 'src/locales/language.ts'), 'utf-8')
  const match = source.match(/export const SUPPORTED\s*=\s*\[([^\]]*)\]/)
  if (!match) return []
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter((s) => s && s !== 'es')
}

const languages = shippedLanguages()

const run = (script, args = []) =>
  execFileSync('node', [path.join(HERE, script), ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
  })

const lines = []
lines.push('ORD Capital Personal — translation toolchain')
lines.push('')
lines.push(`Languages: ${languages.join(', ')}`)
lines.push('')
lines.push('The loop when the Spanish dictionary changes:')
lines.push('')
lines.push('  1. node scripts/i18n/ledger.mjs check        see what changed')
lines.push('  2. node scripts/i18n/delta.mjs <lang>        the keys that language still owes')
lines.push('  3. translate the chunks in scratch/<lang>-delta-output/')
lines.push('  4. node scripts/i18n/apply-delta.mjs <lang>  apply them to the dictionary')
lines.push('  5. node scripts/i18n/ledger.mjs build        record the new translations')
lines.push('  6. repeat for every other language')
lines.push('')
lines.push('The order matters: `build` records the Spanish as the base of every')
lines.push('translation, so building before translating would erase the record of')
lines.push('what still needs work. `build` refuses to run while a language owes keys.')
lines.push('')
lines.push('To see where every language stands:')
lines.push('')
lines.push('  node scripts/i18n/status.mjs')
lines.push('')

if (existsSync(LEDGER)) {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf-8'))
  lines.push('The ledger:')
  lines.push('')
  for (const lang of languages) {
    const entries = ledger.languages?.[lang] ?? {}
    const count = Object.keys(entries).length
    lines.push(`  ${lang}: ${count} keys recorded`)
  }
  lines.push('')
} else {
  lines.push('No ledger yet. Create it with: node scripts/i18n/ledger.mjs build')
  lines.push('')
}

lines.push('The full report:')
lines.push('')
try {
  lines.push(run('status.mjs').trimEnd())
} catch {
  lines.push('(the status report needs the dictionaries in place)')
}

console.log(lines.join('\n'))
