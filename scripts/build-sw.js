// scripts/build-sw.js
// Genera public/sw.js desde public/sw.template.js inyectando un CACHE_NAME
// versionado por commit ref. Asi, cada deploy invalida el cache del SW
// y el navegador descarta los bundles viejos en el activate event.
//
// Si no hay .git, usa Date.now() para garantizar unicidad.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const templatePath = resolve(root, 'public', 'sw.template.js')
const outputPath = resolve(root, 'public', 'sw.js')

let ref = 'unknown'
try {
  ref = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim()
  if (!ref) throw new Error('empty ref')
} catch {
  ref = String(Date.now())
}

const cacheName = `ord-capital-${ref}`
console.log(`▶ Generando ${outputPath} con CACHE_NAME="${cacheName}"`)

if (!existsSync(templatePath)) {
  console.error(`❌ No se encontro el template: ${templatePath}`)
  process.exit(1)
}

const template = readFileSync(templatePath, 'utf-8')
const output = template.replace(/<<<CACHE_NAME>>>/g, cacheName)

writeFileSync(outputPath, output, 'utf-8')
console.log('✅ sw.js generado')
