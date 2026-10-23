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
 * Splits a source file into lines that keep their own terminator.
 *
 * Keeping the terminator per line is what lets a rewrite reproduce the file
 * byte for byte, mixed endings included.
 */
function splitLines(source) {
  const lines = []
  const re = /([^\r\n]*)(\r\n|\n|$)/g
  let m
  while ((m = re.exec(source)) !== null) {
    lines.push({ text: m[1], eol: m[2] })
    if (m[2] === '') break
  }
  return lines
}

const DECL_RE = /^export const (\w+)\s*=\s*\{\s*$/
const CLOSE_RE = /^\};\s*$/
const ENTRY_RE =
  /^(\s*)((?:[a-zA-Z_][a-zA-Z0-9_]*)|(?:'[^']+'))\s*:\s*(["'`])((?:[^\\]|\\.)*)\3(\s*,?)\s*$/

function keyOf(token) {
  return token.startsWith("'") ? token.slice(1, -1).replace(/\\'/g, "'") : token
}

/**
 * Rewrites a dictionary by EDITING the lines whose value changed, instead of
 * regenerating the whole file.
 *
 * Why not regenerate: a dictionary carries comments that group the keys into
 * blocks, and the generated file has no idea they exist. Regenerating throws
 * them away, so an apply that changes nothing still rewrites the file and the
 * diff shows the comments as deleted. Worse, it makes "apply an empty delta"
 * and "apply a delta" two different operations on the same bytes.
 *
 * What this keeps, verbatim: the header, the section order, the comments and
 * blank lines inside every section, the key order, the quoting style, the
 * trailing commas and the line terminators. What it changes: the value of the
 * keys the caller handed over, and nothing else. A key that disappeared from
 * the master loses its line; a key the file does not have yet is appended to
 * the end of its section, in the order the master declares it.
 *
 * An empty change set leaves the file byte for byte identical.
 *
 * Returns the number of entries the file ends up with.
 */
export function writeDictionaryInPlace(file, sections, order, keyOrder = null) {
  const source = readFileSync(file, 'utf-8')
  const lines = splitLines(source)
  const out = []
  const seenSections = new Set()
  let total = 0
  let i = 0

  while (i < lines.length) {
    const decl = lines[i].text.match(DECL_RE)
    if (!decl) {
      out.push(lines[i])
      i++
      continue
    }

    const section = decl[1]
    seenSections.add(section)
    const wanted = sections[section] ?? {}
    const seen = new Set()
    const declared = (keyOrder?.[section] ?? Object.keys(wanted)).filter((k) => k in wanted)
    const pos = new Map(declared.map((k, idx) => [k, idx]))
    const inserted = new Set()
    const eol = lines[i]?.eol || '\n'
    const insert = (key) => {
      out.push({ text: `  ${tsKey(key)}: ${tsString(wanted[key])},`, eol })
      inserted.add(key)
      seen.add(key)
      total++
    }
    // A key the file does not have yet goes where the master puts it, not at
    // the end of the section: the two files have to keep lining up.
    const catchUp = (key) => {
      const limit = pos.get(key)
      if (limit === undefined) return
      for (const k of declared) {
        if (pos.get(k) >= limit) break
        if (!inserted.has(k) && !seen.has(k)) insert(k)
      }
    }
    out.push(lines[i])
    i++

    while (i < lines.length && !CLOSE_RE.test(lines[i].text)) {
      const entry = lines[i].text.match(ENTRY_RE)
      if (!entry) {
        // A comment, a blank line, anything the file groups keys with.
        out.push(lines[i])
        i++
        continue
      }

      const key = keyOf(entry[2])
      const value = wanted[key]
      if (value === undefined) {
        // The master dropped it: the line goes with it.
        i++
        continue
      }

      seen.add(key)
      total++
      catchUp(key)
      if (unescapeLiteral(entry[4]) === value) {
        out.push(lines[i])
      } else {
        out.push({
          text: `${entry[1]}${tsKey(key)}: ${tsString(value)},`,
          eol: lines[i].eol,
        })
      }
      i++
    }

    // Whatever the file still does not have: the rest of the section, in the
    // order the master declares it.
    for (const key of declared) if (!inserted.has(key) && !seen.has(key)) insert(key)
    for (const key of Object.keys(wanted)) {
      if (!pos.has(key) && !inserted.has(key) && !seen.has(key)) insert(key)
    }

    if (i < lines.length) {
      out.push(lines[i])
      i++
    }
  }

  // A section the file does not have at all: it goes at the end.
  for (const section of order) {
    const wanted = sections[section]
    if (!wanted || seenSections.has(section)) continue
    const keys = keyOrder?.[section] ?? Object.keys(wanted)
    const eol = lines.find((l) => l.eol)?.eol ?? '\n'
    const last = out[out.length - 1]
    if (last && !last.eol) last.eol = eol
    out.push({ text: '', eol })
    out.push({ text: `export const ${section} = {`, eol })
    for (const key of keys.filter((k) => k in wanted)) {
      out.push({ text: `  ${tsKey(key)}: ${tsString(wanted[key])},`, eol })
      total++
    }
    out.push({ text: '};', eol })
  }

  writeFileSync(file, out.map((l) => l.text + l.eol).join(''), 'utf-8')
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
