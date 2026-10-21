// Apply the confirmation-word change to the two destructive RPCs.
//
//   node tests/sql/apply_delete_confirmation_words.js
//
// The two backend functions compared the confirmation text against a SPANISH
// literal ('ELIMINAR' and 'BORRAR DATOS'). The word is now fixed in English
// and travels as a placeholder from the UI, so the backend compares against
// the same fixed word.
//
//   fn_eliminar_cuenta_usuario: 'ELIMINAR'    -> 'DELETE'
//   fn_borrar_datos_usuario:   'BORRAR DATOS' -> 'ERASE'
//
// It uses the Management API with the ACCESS_TOKEN (PAT) from .env.local:
//   POST https://api.supabase.com/v1/projects/{ref}/database/query
//   { "query": "..." }
//
// The change is a string replacement inside the function body, so the rest of
// the function is untouched.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

/** Parses a .env file into an object. */
function parseEnvFile(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([^=]+)=(.*)$/)
    if (!m) continue
    let val = m[2].trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[m[1].trim()] = val
  }
  return out
}

const env = { ...parseEnvFile(path.join(ROOT, '.env.local')), ...process.env }
const ACCESS_TOKEN = env.ACCESS_TOKEN
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL

if (!ACCESS_TOKEN || !SUPABASE_URL) {
  console.error('❌ Faltan ACCESS_TOKEN o SUPABASE_URL en el entorno')
  process.exit(2)
}

const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1]
if (!projectRef) {
  console.error(`❌ No pude deducir el project_ref de ${SUPABASE_URL}`)
  process.exit(2)
}

const ENDPOINT = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

/** Runs a SQL statement through the Management API. */
async function runSql(query) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const body = await res.text()
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 400)}`)
  }
  return body
}

/** The function body, as it lives in the mirror file. */
function readMirrorSql(file) {
  const content = fs.readFileSync(path.join(ROOT, 'funcionesSQL', file), 'utf-8')
  // The mirror is markdown with the SQL in a fenced block, or the bare SQL.
  const fenced = content.match(/```sql\n([\s\S]*?)```/)
  return (fenced ? fenced[1] : content).trim()
}

const CHANGES = [
  {
    file: 'fn_eliminar_cuenta_usuario.md',
    from: "'ELIMINAR'",
    to: "'DELETE'",
    why: 'the account deletion word is now the fixed English DELETE',
  },
  {
    file: 'fn_borrar_datos_usuario.md',
    from: "'BORRAR DATOS'",
    to: "'ERASE'",
    why: 'the data deletion word is now the fixed English ERASE',
  },
]

async function main() {
  console.log(`proyecto: ${projectRef}`)

  for (const change of CHANGES) {
    const sql = readMirrorSql(change.file)
    if (!sql.includes(change.from)) {
      console.error(`❌ ${change.file}: no encontré ${change.from} en el SQL`)
      process.exit(1)
    }
    const updated = sql.replace(change.from, change.to)
    if (updated === sql) {
      console.error(`❌ ${change.file}: el reemplazo no cambió nada`)
      process.exit(1)
    }

    console.log(`\n→ ${change.file}: ${change.from} -> ${change.to}`)
    await runSql(updated)
    console.log('  aplicado')
  }

  // Verify: the functions must now compare against the new words.
  console.log('\n→ verificando')
  const check = await runSql(`
    SELECT p.proname, p.prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_eliminar_cuenta_usuario', 'fn_borrar_datos_usuario');
  `)
  const body = String(check)
  for (const change of CHANGES) {
    const ok = body.includes(change.to)
    console.log(`  ${change.to}: ${ok ? 'OK' : 'NO ENCONTRADO'}`)
    if (!ok) {
      console.log('  respuesta cruda:', body.slice(0, 600))
      process.exit(1)
    }
  }
  console.log('\nListo.')
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
