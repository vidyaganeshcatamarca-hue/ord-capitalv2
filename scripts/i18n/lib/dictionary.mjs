// Shared dictionary reading and writing.
//
//   import { readDictionary, writeDictionary } from './lib/dictionary.mjs'
//
// ONE implementation, so the reading and the writing cannot disagree.
//
// The trap this module exists to close: a dictionary file stores the value
// ESCAPED ("Arquivar \"{nombre}\"?") because that is what a TS string
// literal needs, but the value the app renders is UNESCAPED
// ('Arquivar "{nombre}"?'). Reading the file without undoing the escape and
// writing it back with the escape applied again doubles the backslashes, and
// the app then renders a visible backslash where it should render a quote.
//
// The rule, in one line: read UNESCAPED, write ESCAPED.
import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Undoes the escaping of a TS string literal: \" -> ", \\ -> \.
 *
 * The extracted values carry the RAW source text.
 */
export function unescapeLiteral(raw) {
  return String(raw).replace(/\\(["'\\`])/g, '$1')
}

/**
 * Escapes a value for a double-quoted TS string literal.
 *
 * The inverse of unescapeLiteral: a quote inside the string becomes
 * backslash-quote, and a literal backslash becomes two backslashes.
 */
export function tsString(value) {
  const raw = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
  return '"' + raw + '"'
}

/** A key needs quoting when it is not a plain identifier. */
export function tsKey(key) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : "'" + key.replace(/'/g, "\\'") + "'"
}

/**
 * Reads a locale dictionary into { section: { key: value } }, with the
 * values UNESCAPED (the value the app renders).
 */
export function readDictionary(file) {
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
    while ((k = kv.exec(body)) !== null) entries[k[1]] = unescapeLiteral(k[3])
    // Keys with dots are quoted in the source, so the plain-name regex above
    // misses them. Recover them with a second pass.
    const dotted = /^\s*('[^']+')\s*:\s*(['"`])((?:[^\\]|\\.)*?)\2\s*,?/gm
    let d
    while ((d = dotted.exec(body)) !== null) entries[d[1].slice(1, -1)] = unescapeLiteral(d[3])
    sections[m[1]] = entries
  }
  return sections
}

/** The placeholder names of a value, in the order they appear. */
export function placeholders(value) {
  return [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1])
}

/** The order the sections are declared in a dictionary file. */
export function sectionOrder(file) {
  const source = readFileSync(file, 'utf-8')
  const order = []
  const declRe = /export const (\w+)\s*=\s*\{/g
  let m
  while ((m = declRe.exec(source)) !== null) order.push(m[1])
  return order
}

/**
 * Writes a dictionary file: the sections in the given order, the values
 * escaped.
 *
 * The line ending of the file being replaced is kept. The repository checks
 * out with CRLF on Windows and stores LF, so a writer that always emits LF
 * leaves every file looking modified to Git, with a diff that shows
 * nothing.
 */
export function writeDictionary(file, sections, order, header = '') {
  const out = []
  if (header) out.push(header)
  let total = 0
  for (const section of order) {
    const entries = sections[section]
    if (!entries) continue
    out.push(`export const ${section} = {`)
    for (const [key, value] of Object.entries(entries)) {
      out.push(`  ${tsKey(key)}: ${tsString(value)},`)
      total++
    }
    out.push('};')
    out.push('')
  }
  const eol = detectEol(file)
  writeFileSync(file, out.join(eol), 'utf-8')
  return total
}

/**
 * The line ending the file already uses, so a rewrite does not change it.
 *
 * A file that does not exist yet gets LF: that is what the repository
 * stores, whatever the checkout does.
 */
function detectEol(file) {
  try {
    const source = readFileSync(file, 'utf-8')
    const crlf = (source.match(/\r\n/g) || []).length
    const lf = (source.match(/\n/g) || []).length - crlf
    // The dominant ending wins; ties go to CRLF, which is what a checkout
    // on Windows produces.
    return crlf >= lf && crlf > 0 ? '\r\n' : '\n'
  } catch {
    return '\n'
  }
}
