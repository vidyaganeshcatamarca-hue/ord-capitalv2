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

/**
 * The order of the sections in a dictionary file.
 */
export function sectionOrder(file) {
  const source = readFileSync(file, 'utf-8')
  const order = []
  const declRe = /export const (\w+)\s*=\s*\{/g
  let m
  while ((m = declRe.exec(source)) !== null) order.push(m[1])
  return order
}

/**
 * The order of the keys inside every section, as { section: [key, ...] }.
 *
 * A translation is the MIRROR of the master: the same keys in the same
 * order. Without this, a key added to the master lands at the END of its
 * section in the translation, and the two files stop lining up — which
 * makes every diff noisier than it needs to be.
 */
export function keyOrderOf(sections) {
  const order = {}
  for (const [section, entries] of Object.entries(sections)) {
    order[section] = Object.keys(entries)
  }
  return order
}

/**
 * The comment block at the top of a file, up to the first declaration.
 *
 * A dictionary has a header that explains what the file is. Rewriting the
 * file must not replace that header with a generic one: the header is the
 * only place the file says what it is.
 *
 * The trailing blank lines are NOT part of the header: the writer puts the
 * separator itself, and a header that already ended in a newline would
 * leave a doubled blank line in the file.
 */
export function readHeader(file) {
  const source = readFileSync(file, 'utf-8')
  const firstDecl = source.search(/^export const /m)
  if (firstDecl < 0) return ''
  return source.slice(0, firstDecl).replace(/\s+$/, '')
}

/**
 * Writes a dictionary file: the sections in the given order, the values
 * escaped.
 *
 * The line ending of the file being replaced is kept. The repository checks
 * out with CRLF on Windows and stores LF, so a writer that always emits LF
 * leaves every file looking modified to Git, with a diff that shows
 * nothing.
 *
 * `keyOrder` decides the order of the keys inside each section. The keys it
 * does not mention go last, in the order they were added.
 */
export function writeDictionary(file, sections, order, header = '', keyOrder = null) {
  const out = []
  if (header) {
    out.push(header)
    // The blank line between the header and the first declaration.
    out.push('')
  }
  let total = 0
  for (const section of order) {
    const entries = sections[section]
    if (!entries) continue
    out.push(`export const ${section} = {`)
    for (const [key, value] of orderedEntries(entries, keyOrder?.[section])) {
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
 * The entries of a section, in the order the master declares them.
 *
 * A key the master does not have goes last: it is a leftover, and the
 * update has to take it out.
 */
function orderedEntries(entries, order) {
  if (!order) return Object.entries(entries)
  const wanted = order.filter((key) => key in entries)
  const rest = Object.keys(entries).filter((key) => !wanted.includes(key))
  return [...wanted, ...rest].map((key) => [key, entries[key]])
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
