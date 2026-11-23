// tests/prestamos/run-transaccional.mjs
//
// Runs a transactional .sql suite through the Supabase Management API and prints
// every returned row, then a PASS/FAIL tally.
//
// The suites under tests/prestamos/ are BEGIN ... ROLLBACK scripts that end with a
// SELECT over a temp result table, so nothing is left behind. This runner refuses to
// send a file that does not end with ROLLBACK for that reason, and it does not touch
// the database in any other way.
//
// Usage: node tests/prestamos/run-transaccional.mjs tests/prestamos/<file>.sql

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

async function main() {
  const archivo = process.argv[2]
  if (!archivo) throw new Error('Falta el archivo .sql')

  const env = cargarEnv()
  const token = env.ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('Falta ACCESS_TOKEN en .env.local')
  let ref = env.SUPABASE_PROJECT_REF || env.PROJECT_REF || ''
  if (!ref) {
    const m = (env.SUPABASE_URL || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.(co|in)/i)
    if (!m) throw new Error('No se pudo derivar el project ref')
    ref = m[1]
  }

  const sql = fs.readFileSync(path.resolve(raiz, archivo), 'utf8')
  if (!/ROLLBACK;\s*$/.test(sql)) {
    throw new Error('el script debe terminar en ROLLBACK; para no dejar datos')
  }

  const respuesta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const texto = await respuesta.text()
  if (!respuesta.ok) {
    console.error(`FALLO HTTP ${respuesta.status}`)
    console.error(texto.slice(0, 4000))
    process.exit(1)
  }

  let filas
  try {
    filas = JSON.parse(texto)
  } catch {
    console.log(texto.slice(0, 4000))
    process.exit(0)
  }
  if (!Array.isArray(filas)) filas = filas.result ?? []

  let pass = 0
  let fail = 0
  for (const fila of filas) {
    const estado = String(fila.resultado ?? '').toUpperCase()
    if (estado === 'PASS') pass += 1
    else if (estado === 'FAIL') fail += 1
    console.log(
      `${String(fila.orden).padStart(3)} ${estado.padEnd(4)} | ${fila.assertion}\n` +
        `        -> ${fila.detalle ?? ''}`
    )
  }
  console.log('')
  console.log(`RESUMEN: ${pass} PASS / ${fail} FAIL / ${filas.length} aserciones`)
  console.log(archivo)
  if (fail > 0 || filas.length === 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
