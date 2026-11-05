// scripts/check-i18n.mjs
// Verifica la cobertura de traducciones en la UI de ORD Capital Personal.
//
// Detecta cuatro clases de uso:
//
//   1. USED-NOT-DEFINED: t('xxx.yyy') llamado pero la key no existe en
//      ninguna seccion de src/locales/es.ts. En la UI se ve la key cruda.
//
//   2. HARDCODED-STRING: literales en espanol hardcodeados fuera de t().
//      Heuristica: strings de >= 3 palabras con tildes/enies, fuera de
//      className/style/comentarios. NO es perfecto; es punto de partida.
//
//   3. DEAD-KEY: keys definidas en es.ts que no aparecen en ningun uso
//      detectable. Son CANDIDATAS a borrar, no una orden de borrado:
//      ver [4], porque una key puede usarse desde una expresion que este
//      check no puede resolver.
//
//   4. DYNAMIC-OPAQUE: t(...) cuyo argumento no es un literal ni un
//      template con parte literal (por ejemplo t(cat.nombre_cuenta), donde
//      la key viene de la base de datos). Mientras existan, el conteo de
//      [3] es un limite superior y ninguna key es borrable sin revisar.
//
// Resolucion de usos dinamicos:
//   - t(`prefijo_${x}`)          -> protege todas las keys con ese prefijo
//   - ARRAY.map((k) => t(k))     -> resuelve las keys literales del array
//   - t(variable)                -> se reporta como opaca, no se adivina
//
// Uso:  node scripts/check-i18n.mjs
// Salida: SIEMPRE exit 0. Es un informe, no un gate (decision del dueño
// 2026-11-05): con 246 keys rotas y 99 strings hardcodeados como deuda
// previa, un gate que nunca pasa se termina ignorando. Cuando la deuda
// baje a cero se puede convertir en gate cambiando el exit final.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(process.cwd())
const SRC = join(ROOT, 'src')
const ES_FILE = join(SRC, 'locales', 'es.ts')
const EXTS = new Set(['.ts', '.tsx'])

// ── 1. Parsear es.ts: extraer por seccion las keys definidas ─────────
// Estructura: `export const <seccion> = { key: "value", ... }`.
// Parser por regex con conteo de llaves: el archivo es texto plano.
export function parseEsSections(source) {
  const sections = {} // { [sectionName]: Set<string> }
  const re = /export const (\w+)\s*=\s*\{/g
  let m
  while ((m = re.exec(source)) !== null) {
    const sectionName = m[1]
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
    const keyRe = /^\s*([a-z_][a-z0-9_]*)\s*:\s*['"`]/gm
    let km
    const keys = new Set()
    while ((km = keyRe.exec(body)) !== null) keys.add(km[1])
    sections[sectionName] = keys
  }
  return sections
}

// ── 2. Escaner de t(...) consciente de strings y comentarios ─────────
// Recorre el source con una pila de contextos para no confundir el
// contenido de un string con codigo, y para SI detectar t() dentro de
// una interpolacion de template (`${t('x')}`).
const isIdentPart = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch)

function readBalanced(source, openIndex, opener = '(', closer = ')') {
  // devuelve el texto entre delimitadores balanceados y el indice posterior
  let depth = 0
  let i = openIndex
  const stack = [] // 'sq' | 'dq' | 'tpl' | 'interp'
  const start = openIndex + 1
  while (i < source.length) {
    const c = source[i]
    const top = stack[stack.length - 1]
    if (top === 'sq' || top === 'dq') {
      if (c === '\\') { i += 2; continue }
      if ((top === 'sq' && c === "'") || (top === 'dq' && c === '"')) stack.pop()
      i++
      continue
    }
    if (top === 'tpl') {
      if (c === '\\') { i += 2; continue }
      if (c === '`') { stack.pop(); i++; continue }
      if (c === '$' && source[i + 1] === '{') { stack.push('interp'); i += 2; continue }
      i++
      continue
    }
    // code / interp
    if (c === "'") { stack.push('sq'); i++; continue }
    if (c === '"') { stack.push('dq'); i++; continue }
    if (c === '`') { stack.push('tpl'); i++; continue }
    if (c === opener) { depth++; i++; continue }
    if (c === closer) {
      depth--
      if (depth === 0) return { text: source.slice(start, i), end: i }
      i++
      continue
    }
    if (c === '}' && top === 'interp') { stack.pop(); i++; continue }
    i++
  }
  return { text: source.slice(start), end: source.length }
}

function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let cur = ''
  const stack = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const top = stack[stack.length - 1]
    if (top === 'sq' || top === 'dq' || top === 'tpl') {
      cur += c
      if (c === '\\') { cur += text[i + 1] ?? ''; i++; continue }
      if ((top === 'sq' && c === "'") || (top === 'dq' && c === '"') || (top === 'tpl' && c === '`')) stack.pop()
      continue
    }
    if (c === "'") { stack.push('sq'); cur += c; continue }
    if (c === '"') { stack.push('dq'); cur += c; continue }
    if (c === '`') { stack.push('tpl'); cur += c; continue }
    if ('([{'.includes(c)) depth++
    if (')]}'.includes(c)) depth--
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += c
  }
  parts.push(cur)
  return parts
}

// Clasifica el primer argumento de t():
//   literal      -> 'x' | "x" | `x` (sin interpolacion)
//   prefix       -> `prefixo_${...}`  (parte literal antes del primer ${)
//   opaque       -> cualquier otra cosa: identificador, miembro, expresion
function classifyArg(arg) {
  const a = arg.trim()
  if (!a) return { kind: 'opaque', expr: '' }

  const q = a[0]
  if ((q === "'" || q === '"') && a.endsWith(q) && a.length >= 2) {
    const inner = a.slice(1, -1)
    if (!inner.includes('\\' + q)) return { kind: 'literal', key: inner }
    return { kind: 'opaque', expr: a }
  }

  if (q === '`') {
    const inner = a.slice(1, a.lastIndexOf('`'))
    const cut = inner.indexOf('${')
    if (cut === -1) return { kind: 'literal', key: inner }
    const prefix = inner.slice(0, cut)
    if (prefix) return { kind: 'prefix', prefix }
    return { kind: 'opaque', expr: a }
  }

  // Concatenacion con parte literal al inicio: 'a_' + x
  const concat = a.match(/^(['"])([^'"]*)\1\s*\+/)
  if (concat) {
    const prefix = concat[2]
    if (prefix) return { kind: 'prefix', prefix }
  }

  return { kind: 'opaque', expr: a }
}

export function extractUsages(source) {
  const literals = [] // { key, line, hasDefault }
  const prefixes = [] // { prefix, line }
  const opaque = [] // { expr, line }

  let line = 1
  let i = 0
  const stack = []
  const n = source.length

  const push = (cls, lineNo, hasDefault) => {
    if (cls.kind === 'literal') literals.push({ key: cls.key, line: lineNo, hasDefault })
    else if (cls.kind === 'prefix') prefixes.push({ prefix: cls.prefix, line: lineNo })
    else opaque.push({ expr: cls.expr, line: lineNo })
  }

  while (i < n) {
    const c = source[i]
    if (c === '\n') line++
    const top = stack[stack.length - 1]

    if (top === 'sq' || top === 'dq') {
      if (c === '\\') { i += 2; continue }
      if ((top === 'sq' && c === "'") || (top === 'dq' && c === '"')) stack.pop()
      i++
      continue
    }
    if (top === 'tpl') {
      if (c === '\\') { i += 2; continue }
      if (c === '`') { stack.pop(); i++; continue }
      if (c === '$' && source[i + 1] === '{') { stack.push('interp'); i += 2; continue }
      i++
      continue
    }

    // contexto de codigo (o dentro de ${}) — saltar comentarios
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) { if (source[i] === '\n') line++; i++ }
      i += 2
      continue
    }
    if (c === "'") { stack.push('sq'); i++; continue }
    if (c === '"') { stack.push('dq'); i++; continue }
    if (c === '`') { stack.push('tpl'); i++; continue }
    if (c === '}' && top === 'interp') { stack.pop(); i++; continue }

    // t( ... ) — 't' que no sea parte de un identificador mayor ni un
    // metodo (obj.t(...) no es la funcion de traduccion)
    if (c === 't' && !isIdentPart(source[i - 1]) && source[i - 1] !== '.') {
      let k = i + 1
      while (k < n && (source[k] === ' ' || source[k] === '\t')) k++
      if (source[k] === '(') {
        const callLine = line
        const { text, end } = readBalanced(source, k)
        const parts = splitTopLevel(text)
        const first = parts[0] ?? ''
        const rest = parts.slice(1).join(',')
        const hasDefault = /defaultValue\s*:/.test(rest)
        push(classifyArg(first), callLine, hasDefault)
        // contar saltos de linea consumidos
        for (let z = k; z < end; z++) if (source[z] === '\n') line++
        i = end + 1
        continue
      }
    }
    i++
  }

  // Arrays recorridos con .map(): IDENT.map((k) => t(k))
  // Se resuelven solo si IDENT es un array literal en el mismo archivo.
  const arrayRe = /(\w+)\s*\.\s*map\s*\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*t\s*\(\s*\2\s*\)/g
  let am
  while ((am = arrayRe.exec(source)) !== null) {
    const [, ident, param] = am
    const decl = new RegExp(`const\\s+${ident}\\s*=\\s*\\[`, 'g')
    const dm = decl.exec(source)
    if (!dm) continue
    const arrStart = dm.index + dm[0].length - 1
    const { text } = readBalanced(source, arrStart, '[', ']')
    const items = splitTopLevel(text)
    for (const raw of items) {
      const cls = classifyArg(raw)
      if (cls.kind === 'literal') literals.push({ key: cls.key, line: 0, hasDefault: false })
    }
    // el t(param) ya quedo como opaca: la quitamos, la resolvimos
    for (let z = opaque.length - 1; z >= 0; z--) {
      if (opaque[z].expr === param) opaque.splice(z, 1)
    }
  }

  return { literals, prefixes, opaque }
}

// ── 3. Heuristica de hardcoded string en espanol ──────────────────────
const SPANISH_RE = /\b([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}){2,})\b/g
const SPANISH_DIACRITIC = /[áéíóúñÁÉÍÓÚÑ]/
const SAFE_LINE_PATTERNS = [
  /\bclassName\s*=/,
  /\bstyle\s*=\s*\{/,
  /\/\//,
  /\/\*/,
  /\bimport\b/,
  /\bicon:|icon\s/,
  /^\s*\*\s/,
  /\b(stroke|fill|path)=/,
  /\b(htmlFor|id|class|aria-\w+)=/,
]

export function looksLikeHardcodedSpanishLine(line) {
  if (!SPANISH_DIACRITIC.test(line)) return null
  if (SAFE_LINE_PATTERNS.some((p) => p.test(line))) return null
  if (/\bt\s*\(/.test(line)) return null
  if (/:\s*['"`][^'"`]*[áéíóúñÁÉÍÓÚÑ]/.test(line)) return null
  const matches = line.match(SPANISH_RE)
  if (!matches) return null
  const candidate = matches.find((m) => {
    const lower = m.toLowerCase()
    if (lower.startsWith('react')) return false
    if (lower.startsWith('use')) return false
    return true
  })
  return candidate || null
}

export function extractHardcodedStrings(source) {
  const lines = source.split('\n')
  const results = []
  for (let i = 0; i < lines.length; i++) {
    const found = looksLikeHardcodedSpanishLine(lines[i])
    if (found) results.push({ text: found, line: i + 1 })
  }
  return results
}

// ── 4. Resolver una key contra las secciones ─────────────────────────
export function resolveKey(key, sections) {
  if (key.includes('.')) {
    const [sectionName, ...rest] = key.split('.')
    if (sections[sectionName] && sections[sectionName].has(rest.join('.'))) {
      return { ok: true, where: `${sectionName}.${rest.join('.')}` }
    }
  }
  for (const [sectionName, keys] of Object.entries(sections)) {
    if (keys.has(key)) return { ok: true, where: sectionName }
  }
  return { ok: false }
}

// ── 5. Dead keys, con proteccion por prefijo dinamico ────────────────
// Una key definida es candidata a muerta solo si no aparece como literal
// y no cae bajo ningun prefijo dinamico detectado.
export function computeDeadKeys(sections, usages) {
  const literalSet = new Set(usages.literals.map((l) => l.key))
  const prefixList = usages.prefixes.map((p) => p.prefix)
  const dead = []
  const protectedByPrefix = []

  const covered = (section, key) => {
    const flat = `${section}_${key}`
    const dotted = `${section}.${key}`
    return prefixList.some((p) => flat.startsWith(p) || dotted.startsWith(p) || key.startsWith(p))
  }

  for (const [section, keys] of Object.entries(sections)) {
    for (const k of keys) {
      const flat = `${section}_${k}`
      if (literalSet.has(k) || literalSet.has(flat) || literalSet.has(`${section}.${k}`)) continue
      if (covered(section, k)) {
        protectedByPrefix.push({ key: k, section })
        continue
      }
      dead.push({ key: k, section })
    }
  }
  return { dead, protectedByPrefix }
}

// ── Main ──────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (EXTS.has(full.slice(full.lastIndexOf('.')))) out.push(full)
  }
  return out
}

function main() {
  const esSource = readFileSync(ES_FILE, 'utf-8')
  const sections = parseEsSections(esSource)
  const definedKeyCount = Object.values(sections).reduce((s, k) => s + k.size, 0)

  const allFiles = walk(SRC)
  const used = { literals: [], prefixes: [], opaque: [] }
  const hardcoded = []
  for (const file of allFiles) {
    if (file.includes('/locales/')) continue
    const source = readFileSync(file, 'utf-8')
    const rel = relative(ROOT, file)
    const u = extractUsages(source)
    for (const l of u.literals) used.literals.push({ ...l, file: rel })
    for (const p of u.prefixes) used.prefixes.push({ ...p, file: rel })
    for (const o of u.opaque) used.opaque.push({ ...o, file: rel })
    for (const h of extractHardcodedStrings(source)) hardcoded.push({ ...h, file: rel })
  }

  const unresolved = []
  const unresolvedWithDefault = []
  for (const u of used.literals) {
    const r = resolveKey(u.key, sections)
    if (!r.ok) (u.hasDefault ? unresolvedWithDefault : unresolved).push(u)
  }

  const { dead, protectedByPrefix } = computeDeadKeys(sections, used)
  const uniqueKeys = new Set(used.literals.map((u) => u.key)).size

  console.log('='.repeat(72))
  console.log('CHECK I18N — ORD Capital Personal')
  console.log('='.repeat(72))
  console.log(`es.ts: ${definedKeyCount} keys en ${Object.keys(sections).length} secciones`)
  console.log(`src/:  ${allFiles.length} archivos escaneados`)
  console.log(`t() literales: ${used.literals.length} (${uniqueKeys} keys unicas)`)
  console.log(`t() con prefijo dinamico: ${used.prefixes.length}  |  t() opacos: ${used.opaque.length}`)
  console.log('')

  let hasFailure = false

  console.log('─'.repeat(72))
  console.log(`[1] USED-NOT-DEFINED: ${unresolved.length} llamadas literales que NO existen en es.ts`)
  console.log('─'.repeat(72))
  if (unresolved.length === 0) {
    console.log('OK — todas las keys literales resuelven en es.ts')
  } else {
    hasFailure = true
    for (const u of unresolved.slice(0, 50)) console.log(`  ${u.file}:${u.line}  →  t('${u.key}')`)
    if (unresolved.length > 50) console.log(`  ... y ${unresolved.length - 50} mas`)
  }
  console.log('')

  console.log('─'.repeat(72))
  console.log(`[1b] USED-NOT-DEFINED con defaultValue: ${unresolvedWithDefault.length} (no rompen UI)`)
  console.log('─'.repeat(72))
  if (unresolvedWithDefault.length > 0) {
    for (const u of unresolvedWithDefault.slice(0, 20)) console.log(`  ${u.file}:${u.line}  →  t('${u.key}')`)
    if (unresolvedWithDefault.length > 20) console.log(`  ... y ${unresolvedWithDefault.length - 20} mas`)
  }
  console.log('')

  console.log('─'.repeat(72))
  console.log(`[2] HARDCODED-STRING: ${hardcoded.length} strings en espanol fuera de t()`)
  console.log('─'.repeat(72))
  if (hardcoded.length === 0) {
    console.log('OK — ningun string hardcodeado detectado')
  } else {
    hasFailure = true
    for (const h of hardcoded.slice(0, 30)) {
      console.log(`  ${h.file}:${h.line}  →  "${h.text.slice(0, 80)}${h.text.length > 80 ? '...' : ''}"`)
    }
    if (hardcoded.length > 30) console.log(`  ... y ${hardcoded.length - 30} mas (revisar manualmente)`)
  }
  console.log('')

  console.log('─'.repeat(72))
  console.log(`[3] DEAD-KEY: ${dead.length} CANDIDATAS (limite superior, no orden de borrado)`)
  console.log(`    protegidas por prefijo dinamico: ${protectedByPrefix.length}`)
  console.log('─'.repeat(72))
  if (dead.length === 0) {
    console.log('OK — todas las keys definidas aparecen en algun uso detectable')
  } else {
    for (const d of dead.slice(0, 30)) console.log(`  ${d.section}.${d.key}`)
    if (dead.length > 30) console.log(`  ... y ${dead.length - 30} mas`)
    console.log('')
    console.log('  ANTES DE BORRAR: una key puede usarse desde una expresion que')
    console.log('  este check no resuelve (ver [4]). Revisar esa lista primero.')
  }
  console.log('')

  console.log('─'.repeat(72))
  console.log(`[4] DYNAMIC-OPAQUE: ${used.opaque.length} llamadas que el check NO puede resolver`)
  console.log('─'.repeat(72))
  if (used.opaque.length === 0) {
    console.log('OK — todos los usos de t() se resolvieron estaticamente')
  } else {
    console.log('  Estas llamadas toman la key de una variable o de datos:')
    for (const o of used.opaque.slice(0, 20)) {
      console.log(`  ${o.file}:${o.line}  →  t(${o.expr.slice(0, 60)})`)
    }
    if (used.opaque.length > 20) console.log(`  ... y ${used.opaque.length - 20} mas`)
  }
  console.log('')

  console.log('='.repeat(72))
  if (hasFailure) {
    console.log('INFORME — hay hallazgos, ver arriba. Este check NO bloquea commits.')
  } else {
    console.log('INFORME — cobertura i18n OK.')
  }
  console.log('Modo informe: siempre sale 0. Se vuelve gate cuando la deuda llegue a cero.')
  process.exit(0)
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main()
