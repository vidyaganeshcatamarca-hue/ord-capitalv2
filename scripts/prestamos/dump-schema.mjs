/**
 * Regenerates the two schema dumps in `start_info/` from the DEPLOYED catalog.
 *
 * Both files were stale: `tablas todas.md` was missing p_caja.moneda,
 * p_caja.valor_local, p_caja.moneda_local, p_caja.tasa_snapshot,
 * p_caja.parent_pago_caja_id, p_cuotas_detalle.moneda, p_ingresos.activo and
 * more. Versioning a document known to be wrong is worse than not versioning it,
 * so these are rebuilt from information_schema instead of hand-maintained.
 *
 * Writes:
 *   start_info/tablas todas.md      — JSON array, machine-readable (keeps the
 *                                     shape the repo already used)
 *   start_info/relaciones_tablas.md — markdown listing, human-readable
 *
 * Structure only. Never credentials, never row data.
 *
 * Usage: node scripts/prestamos/dump-schema.mjs
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv() {
  const raw = readFileSyncSafe(resolve(process.cwd(), '.env.local'))
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

import { readFileSync as readFileSyncRaw } from 'node:fs'
function readFileSyncSafe(path) {
  return readFileSyncRaw(path, 'utf8')
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

async function runQuery(sql) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`)
  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : (parsed.result ?? parsed)
}

const COLUMNS_SQL = `
  SELECT c.table_name,
         c.ordinal_position,
         c.column_name,
         c.data_type,
         c.character_maximum_length,
         c.is_nullable,
         c.column_default,
         c.is_identity,
         c.is_generated
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  ORDER BY c.table_name, c.ordinal_position`

const CONSTRAINTS_SQL = `
  SELECT t.relname AS table_name, c.contype, c.conname,
         pg_get_constraintdef(c.oid) AS definicion
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
  ORDER BY t.relname, c.contype, c.conname`

const rows = await runQuery(COLUMNS_SQL)
const constraints = await runQuery(CONSTRAINTS_SQL)

const byTable = new Map()
for (const row of rows) {
  if (!byTable.has(row.table_name)) byTable.set(row.table_name, [])
  byTable.get(row.table_name).push(row)
}

const tableNames = Array.from(byTable.keys()).sort()

// ---- start_info/tablas todas.md : JSON, same shape the repo already used ----
const jsonDump = tableNames.map((table_name) => ({
  columns: byTable.get(table_name).map((column) => ({
    data_type:
      column.data_type === 'character varying' && column.character_maximum_length
        ? 'character varying'
        : column.data_type,
    column_name: column.column_name,
    is_identity: column.is_identity,
    is_nullable: column.is_nullable,
    column_default: column.column_default,
    character_maximum_length: column.character_maximum_length,
    is_generated: column.is_generated,
  })),
  table_name,
}))

const jsonPath = resolve(process.cwd(), 'start_info/tablas todas.md')
writeFileSync(jsonPath, `${JSON.stringify(jsonDump, null, 4)}\n`, 'utf8')

// ---- start_info/relaciones_tablas.md : human-readable ----
const constraintsByTable = new Map()
for (const row of constraints) {
  if (!constraintsByTable.has(row.table_name)) constraintsByTable.set(row.table_name, [])
  constraintsByTable.get(row.table_name).push(row)
}

const lines = []
lines.push('# Relaciones y estructura de tablas')
lines.push('')
lines.push('<!-- GENERADO AUTOMATICAMENTE. No editar a mano.')
lines.push(`     Origen: catalogo desplegado, proyecto ${ref}.`)
lines.push(`     Generador: scripts/prestamos/dump-schema.mjs`)
lines.push(`     Tablas: ${tableNames.length}`)
lines.push('     Solo estructura. Sin datos, sin credenciales. -->')
lines.push('')
lines.push('Regenerar con: `node scripts/prestamos/dump-schema.mjs`')
lines.push('')

for (const table of tableNames) {
  lines.push(`## \`${table}\``)
  lines.push('')
  lines.push('| # | Columna | Tipo | Largo | Nulo | Default |')
  lines.push('|---|---|---|---|---|---|')
  for (const column of byTable.get(table)) {
    const type = column.character_maximum_length
      ? `${column.data_type}(${column.character_maximum_length})`
      : column.data_type
    const printable = (value) =>
      value === null || value === undefined
        ? ''
        : String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ')
    lines.push(
      `| ${column.ordinal_position} | \`${column.column_name}\` | ${printable(type)} | ${printable(
        column.character_maximum_length,
      )} | ${column.is_nullable} | ${printable(column.column_default)} |`,
    )
  }
  lines.push('')
  const tableConstraints = constraintsByTable.get(table) || []
  if (tableConstraints.length > 0) {
    lines.push('**Restricciones**')
    lines.push('')
    for (const constraint of tableConstraints) {
      const kind =
        { p: 'PK', f: 'FK', c: 'CHECK', u: 'UNIQUE', x: 'EXCLUDE' }[constraint.contype] ||
        constraint.contype
      lines.push(`- \`${kind}\` ${constraint.conname}: ${constraint.definicion}`)
    }
    lines.push('')
  }
}

const mdPath = resolve(process.cwd(), 'start_info/relaciones_tablas.md')
writeFileSync(mdPath, `${lines.join('\n')}\n`, 'utf8')

console.log(`Proyecto: ${ref}`)
console.log(`Tablas: ${tableNames.length}`)
console.log(`Columnas: ${rows.length}`)
console.log(`Restricciones: ${constraints.length}`)
console.log(`Escrito: ${jsonPath}`)
console.log(`Escrito: ${mdPath}`)
