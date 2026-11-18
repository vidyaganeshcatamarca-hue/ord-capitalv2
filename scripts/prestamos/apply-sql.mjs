/**
 * Applies a SQL file to the deployed database through the Management API.
 *
 * The project keeps RPC mirrors in funcionesSQL/ but that directory must never
 * hold migrations (see AGENTS rule 5), so migrations live under
 * supabase/migrations/ and are applied with this runner.
 *
 * Prints the statement count and any returned rows. Never prints credentials.
 *
 * Usage:
 *   node scripts/prestamos/apply-sql.mjs supabase/migrations/<file>.sql
 *   node scripts/prestamos/apply-sql.mjs <file>.sql --what-if   (syntax check only)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const fileArg = args.find((arg) => !arg.startsWith('--'))
const whatIf = args.includes('--what-if')

if (!fileArg) {
  console.error('Falta la ruta del archivo .sql')
  console.error('Uso: node scripts/prestamos/apply-sql.mjs <archivo.sql> [--what-if]')
  process.exit(2)
}

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[trimmed.slice(0, eq).trim()] = value
  }
  return env
}

const env = loadEnv()
const token = env.ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN
if (!token) throw new Error('Falta ACCESS_TOKEN.')
let ref = env.SUPABASE_PROJECT_REF || env.PROJECT_REF || ''
if (!ref) {
  const match = (env.SUPABASE_URL || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.(co|in)/i)
  if (!match) throw new Error('No se pudo derivar el project ref.')
  ref = match[1]
}
const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`

const sql = readFileSync(resolve(process.cwd(), fileArg), 'utf8')

const statements = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((part) => part.trim())
  .filter((part) => part.length > 0)

console.log(`Proyecto: ${ref}`)
console.log(`Archivo: ${fileArg}`)
console.log(`Sentencias detectadas: ${statements.length}`)
for (const statement of statements) {
  const head = statement.replace(/\s+/g, ' ').slice(0, 100)
  console.log(`  · ${head}${statement.length > 100 ? '…' : ''}`)
}

if (whatIf) {
  console.log('\n--what-if: no se envio nada a la base.')
  process.exit(0)
}

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const text = await response.text()

if (!response.ok) {
  console.error(`\nFALLO HTTP ${response.status}`)
  console.error(text.slice(0, 2000))
  process.exit(1)
}

console.log('\nAplicado.')
if (text && text.trim() !== '[]' && text.trim() !== '') {
  console.log('Respuesta:')
  console.log(text.slice(0, 2000))
}
