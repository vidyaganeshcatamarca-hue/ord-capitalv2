// scripts/check-i18n.mjs
// Verifica la cobertura de traducciones en la UI de ORD Capital Personal.
// Detecta tres clases de problemas:
//
//   1. USED-NOT-DEFINED: t('xxx.yyy') llamado desde un .tsx/.ts pero la key
//      no existe en ninguna seccion de src/locales/es.ts. En la UI se ve
//      la key cruda ("xxx.yyy") en vez del texto traducido.
//
//   2. HARDCODED-STRING: literales en espanol hardcodeados dentro de
//      .tsx/.ts que probablemente deberian pasar por t(). Heuristica:
//      busca strings de >= 3 palabras en espanol (con tildes/enies
//      comunes) que no esten dentro de un className=, style=, o un
//      comentario. NO es perfecto; es un punto de partida para
//      auditoria manual.
//
//   3. DEAD-KEY: keys definidas en es.ts que no se llaman desde ningun
//      archivo del src/. Sirve para limpiar es.ts despues de refactors.
//
// Uso:  node scripts/check-i18n.mjs
// Salida: exit 0 si todo OK, exit 1 si hay USED-NOT-DEFINED o
//         HARDCODED-STRING (los Dead son warning, no falla).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(process.cwd())
const SRC = join(ROOT, 'src')
const ES_FILE = join(SRC, 'locales', 'es.ts')
const EXTS = new Set(['.ts', '.tsx'])

// ── 1. Parsear es.ts: extraer por seccion las keys definidas ─────────
// Estructura: `export const <seccion> = { key: "value", ... }`.
// Usamos un parser por regex porque el archivo no requiere TS runtime
// (es texto plano). El parser cuenta llaves para encontrar el cierre
// de cada seccion y luego extrae keys con un regex de top-level entries.
function parseEsSections(source) {
  const sections = {} // { [sectionName]: Set<string> }
  const re = /export const (\w+)\s*=\s*\{/g
  let m
  while ((m = re.exec(source)) !== null) {
    const sectionName = m[1]
    const bodyStart = m.index + m[0].length
    // Encontrar la llave de cierre del export const.
    let depth = 1
    let j = bodyStart
    while (j < source.length && depth > 0) {
      const ch = source[j]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      j++
    }
    const body = source.slice(bodyStart, j - 1)
    // Extraer keys top-level: lineas que arrancan con identificador y ':'
    // seguido de un string. Saltamos keys anidadas (no son buscadas por
    // el t() actual).
    const keyRe = /^\s*([a-z_][a-z0-9_]*)\s*:\s*['"`]/gm
    let km
    const keys = new Set()
    while ((km = keyRe.exec(body)) !== null) {
      keys.add(km[1])
    }
    sections[sectionName] = keys
  }
  return sections
}

// ── 2. Recorrer src/ recursivamente y extraer call sites de t(...) ────
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

function extractTCalls(file) {
  // Acepta t('key'), t("key"), t(`key`), t(  'key'  ).
  // Tambien captura t('key', { ... }) con o sin el objeto.
  const source = readFileSync(file, 'utf-8')
  const results = [] // { key, line }
  const lines = source.split('\n')
  const re = /\bt\s*\(\s*['"`]([^'"`]+)['"`]/
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re)
    if (m) results.push({ key: m[1], line: i + 1 })
  }
  return results
}

// ── 3. Heuristica de hardcoded string en espanol ──────────────────────
// Buscamos secuencias de >= 3 palabras seguidas con al menos una tilde o
// enie, en lineas que NO sean className/style/comentario.
const SPANISH_RE = /\b([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}){2,})\b/g
const SPANISH_DIACRITIC = /[áéíóúñÁÉÍÓÚÑ]/
const SAFE_LINE_PATTERNS = [
  /\bclassName\s*=/,
  /\bstyle\s*=\s*\{/,
  /\/\//, // comentario linea
  /\/\*/, // comentario bloque (no perfecto, suficiente)
  /\bimport\b/,
  /\bicon:|icon\s/,
  /^\s*\*\s/, // jsdoc
  /\b(stroke|fill|path)=/, // SVG attrs
  /\b(htmlFor|id|class|aria-\w+)=/, // atributos JSX
]

function looksLikeHardcodedSpanishLine(line) {
  if (!SPANISH_DIACRITIC.test(line)) return null
  if (SAFE_LINE_PATTERNS.some(p => p.test(line))) return null
  // Ignorar lineas que ya estan en t() o en objetos de i18n.
  if (/\bt\s*\(/.test(line)) return null
  if (/:\s*['"`][^'"`]*[áéíóúñÁÉÍÓÚÑ]/.test(line)) return null // parece key de es.ts
  const matches = line.match(SPANISH_RE)
  if (!matches) return null
  // Filtrar nombres propios tipicos y abreviaturas.
  const candidate = matches.find(m => {
    const lower = m.toLowerCase()
    if (lower.startsWith('react')) return false
    if (lower.startsWith('use')) return false // useState, useEffect, etc
    return true
  })
  return candidate || null
}

function extractHardcodedStrings(file) {
  const source = readFileSync(file, 'utf-8')
  const lines = source.split('\n')
  const results = [] // { text, line }
  for (let i = 0; i < lines.length; i++) {
    const found = looksLikeHardcodedSpanishLine(lines[i])
    if (found) results.push({ text: found, line: i + 1 })
  }
  return results
}

// ── 4. Resolver una key contra las secciones ─────────────────────────
// Reproduce la logica de t() en src/locales/i18n.ts:
//   1. Si la key existe literal en alguna seccion -> OK
//   2. Si la key tiene un '.', probar seccion.key -> OK
//   3. Si no, falla.
function resolveKey(key, sections) {
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

// ── Main ──────────────────────────────────────────────────────────────
const esSource = readFileSync(ES_FILE, 'utf-8')
const sections = parseEsSections(esSource)
const definedKeyCount = Object.values(sections).reduce((s, k) => s + k.size, 0)

const allFiles = walk(SRC)
const usedKeys = [] // { key, file, line }
const hardcoded = [] // { text, file, line }
for (const file of allFiles) {
  if (file.includes('/locales/')) continue // no escanear es.ts ni i18n.ts
  for (const c of extractTCalls(file)) usedKeys.push({ ...c, file: relative(ROOT, file) })
  for (const h of extractHardcodedStrings(file)) hardcoded.push({ ...h, file: relative(ROOT, file) })
}

// USED-NOT-DEFINED: cada call site de t() que no resuelve
const unresolved = []
for (const u of usedKeys) {
  const r = resolveKey(u.key, sections)
  if (!r.ok) unresolved.push(u)
}

// DEAD-KEY: keys definidas que no se llaman
const calledKeySet = new Set()
for (const u of usedKeys) calledKeySet.add(u.key)
const deadKeys = []
for (const [sectionName, keys] of Object.entries(sections)) {
  for (const k of keys) {
    if (!calledKeySet.has(k)) deadKeys.push({ key: k, section: sectionName })
  }
}

const usedCount = usedKeys.length
const uniqueKeys = new Set(usedKeys.map(u => u.key)).size

console.log('='.repeat(72))
console.log('CHECK I18N — ORD Capital Personal')
console.log('='.repeat(72))
console.log(`es.ts: ${definedKeyCount} keys en ${Object.keys(sections).length} secciones`)
console.log(`src/:  ${allFiles.length} archivos escaneados`)
console.log(`t() calls: ${usedCount} (${uniqueKeys} keys unicas)`)
console.log('')

let hasFailure = false

// 1) USED-NOT-DEFINED
console.log('─'.repeat(72))
console.log(`[1] USED-NOT-DEFINED: ${unresolved.length} keys llamadas que NO existen en es.ts`)
console.log('─'.repeat(72))
if (unresolved.length === 0) {
  console.log('OK — todas las keys llamadas resuelven en es.ts')
} else {
  hasFailure = true
  for (const u of unresolved.slice(0, 50)) {
    console.log(`  ${u.file}:${u.line}  →  t('${u.key}')`)
  }
  if (unresolved.length > 50) console.log(`  ... y ${unresolved.length - 50} mas`)
}
console.log('')

// 2) HARDCODED-STRING
console.log('─'.repeat(72))
console.log(`[2] HARDCODED-STRING: ${hardcoded.length} strings en espanol potencialmente fuera de t()`)
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

// 3) DEAD-KEY (warning, no falla)
console.log('─'.repeat(72))
console.log(`[3] DEAD-KEY: ${deadKeys.length} keys definidas en es.ts que no se llaman (warning)`)
console.log('─'.repeat(72))
if (deadKeys.length === 0) {
  console.log('OK — todas las keys definidas estan en uso')
} else {
  for (const d of deadKeys.slice(0, 30)) {
    console.log(`  ${d.section}.${d.key}`)
  }
  if (deadKeys.length > 30) console.log(`  ... y ${deadKeys.length - 30} mas`)
}
console.log('')

console.log('='.repeat(72))
if (hasFailure) {
  console.log('FAIL — hay keys sin resolver o strings hardcodeados. Revisar arriba.')
  process.exit(1)
} else {
  console.log('PASS — cobertura i18n OK.')
  process.exit(0)
}
