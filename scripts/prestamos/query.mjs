/**
 * Runs one read-only query and prints the raw JSON response.
 *
 * Exists because apply-sql.mjs truncates its output at 2.000 characters, which is
 * too small to inspect a deployed function body.
 *
 * Usage: node scripts/prestamos/query.mjs "SELECT ..."
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = process.argv.slice(2).join(' ').trim()
if (!sql) {
  console.error('Falta la consulta.')
  console.error('Uso: node scripts/prestamos/query.mjs "SELECT ..."')
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

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const text = await response.text()
if (!response.ok) {
  console.error(`FALLO HTTP ${response.status}`)
  console.error(text.slice(0, 2000))
  process.exit(1)
}

let rows
try {
  rows = JSON.parse(text)
  if (!Array.isArray(rows)) rows = rows.result ?? rows
} catch {
  console.log(text.slice(0, 20000))
  process.exit(0)
}

if (Array.isArray(rows)) {
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      console.log(`--- ${key} ---`)
      console.log(typeof value === 'string' ? value : JSON.stringify(value))
    }
  }
  console.log(`(${rows.length} fila/s)`)
} else {
  console.log(JSON.stringify(rows, null, 2))
}
