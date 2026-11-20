// tests/prestamos/run-migracion-sin-aplicar.mjs
//
// Runs a migration TOGETHER WITH a transactional suite, without applying it.
//
// Why this exists: the suites under tests/prestamos/ assert the behaviour of a function
// that is deployed. A migration that has not been applied yet cannot be exercised by
// them, and applying it only to be able to run the test means changing the production
// database before anyone decided to. This runner composes both files into ONE
// transaction and always ends it with ROLLBACK:
//
//   BEGIN;
//   <migration body, without its own BEGIN/COMMIT>
//   <suite, without its own BEGIN/ROLLBACK>
//   ROLLBACK;
//
// The function that the migration creates therefore exists only inside that transaction:
// the suite runs against the new body, the DDL is undone, and nothing is left behind. It
// refuses to run a file that does not start with BEGIN; and end with COMMIT; (migration)
// or ROLLBACK; (suite), so a stray script cannot be committed by accident through here.
//
// Usage:
//   node tests/prestamos/run-migracion-sin-aplicar.mjs \
//        supabase/migrations/<migracion>.sql tests/prestamos/<suite>.sql

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '../..')

function cargarEnv() {
  const env = {}
  const crudo = fs.readFileSync(path.join(raiz, '.env.local'), 'utf8')
  for (const linea of crudo.split(/\r?\n/)) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue
    const eq = limpia.indexOf('=')
    if (eq === -1) continue
    let valor = limpia.slice(eq + 1).trim()
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }
    env[limpia.slice(0, eq).trim()] = valor
  }
  return env
}

function cuerpoDeMigracion(ruta) {
  const sql = fs.readFileSync(path.resolve(raiz, ruta), 'utf8')
  if (!/^\s*BEGIN;\s*$/m.test(sql)) throw new Error(`${ruta}: falta BEGIN;`)
  if (!/COMMIT;\s*$/.test(sql)) throw new Error(`${ruta}: debe terminar en COMMIT;`)
  return sql.replace(/^\s*BEGIN;\s*$/m, '').replace(/COMMIT;\s*$/, '')
}

function cuerpoDeSuite(ruta) {
  const sql = fs.readFileSync(path.resolve(raiz, ruta), 'utf8')
  if (!/^\s*BEGIN;\s*$/m.test(sql)) throw new Error(`${ruta}: falta BEGIN;`)
  if (!/ROLLBACK;\s*$/.test(sql)) throw new Error(`${ruta}: debe terminar en ROLLBACK;`)
  return sql.replace(/^\s*BEGIN;\s*$/m, '').replace(/ROLLBACK;\s*$/, '')
}

async function main() {
  const [migracion, suite] = process.argv.slice(2)
  if (!migracion || !suite) {
    throw new Error('Uso: run-migracion-sin-aplicar.mjs <migracion.sql> <suite.sql>')
  }

  const env = cargarEnv()
  const token = env.ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('Falta ACCESS_TOKEN en .env.local')
  let ref = env.SUPABASE_PROJECT_REF || env.PROJECT_REF || ''
  if (!ref) {
    const m = (env.SUPABASE_URL || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.(co|in)/i)
    if (!m) throw new Error('No se pudo derivar el project ref')
    ref = m[1]
  }

  const sql = [
    '-- compuesto por tests/prestamos/run-migracion-sin-aplicar.mjs',
    'BEGIN;',
    cuerpoDeMigracion(migracion),
    cuerpoDeSuite(suite),
    'ROLLBACK;',
  ].join('\n')

  console.log(`Proyecto: ${ref}`)
  console.log(`Migracion (sin aplicar): ${migracion}`)
  console.log(`Suite: ${suite}`)
  console.log(`Transaccion: ${sql.length} caracteres, termina en ROLLBACK`)

  const respuesta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const texto = await respuesta.text()

  if (!respuesta.ok) {
    console.error(`\nFALLO HTTP ${respuesta.status}`)
    console.error(texto.slice(0, 4000))
    process.exit(1)
  }

  let filas
  try {
    filas = JSON.parse(texto)
    if (!Array.isArray(filas)) filas = filas.result ?? filas
  } catch {
    console.log(texto.slice(0, 4000))
    return
  }

  if (!Array.isArray(filas)) {
    console.log(JSON.stringify(filas, null, 2))
    return
  }

  for (const fila of filas) {
    console.log('---')
    for (const [clave, valor] of Object.entries(fila)) {
      console.log(`${clave}: ${typeof valor === 'string' ? valor : JSON.stringify(valor)}`)
    }
  }
  console.log(`(${filas.length} fila/s; la transaccion termino en ROLLBACK)`)
}

await main()
