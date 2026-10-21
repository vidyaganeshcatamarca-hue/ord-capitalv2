// tests/sql/run_delete_confirmation_test.js
// Crea el runner de testing en Supabase, lo ejecuta via Management API,
// captura el resultado, y borra el runner.
//
// Regla TDD del proyecto: transaccional, ROLLBACK, sin datos residuales.
// El runner NUNCA debe quedar en Supabase: se DROPea al final.
//
//   node tests/sql/run_delete_confirmation_test.js
//
// Requiere SUPABASE_URL (o VITE_SUPABASE_URL) y ACCESS_TOKEN en el entorno.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sqlPath = path.join(__dirname, 'fn_run_delete_confirmation_test.sql')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const PAT = process.env.ACCESS_TOKEN

if (!SUPABASE_URL || !PAT) {
  console.error('❌ Faltan SUPABASE_URL o ACCESS_TOKEN en el entorno')
  process.exit(2)
}

const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
const mgmtBase = `https://api.supabase.com/v1/projects/${projectRef}/database`

async function mgmtRun(sql, label) {
  const res = await fetch(`${mgmtBase}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PAT}`,
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`❌ ${label} falló (${res.status}):`)
    console.error(text)
    throw new Error(`mgmt ${label} failed`)
  }
  return text
}

async function main() {
  const runnerSql = fs.readFileSync(sqlPath, 'utf-8')

  // 1. Crear el runner
  console.log('▶ Creando fn_run_delete_confirmation_test...')
  await mgmtRun(runnerSql, 'CREATE RUNNER')
  console.log('✅ Runner creado')

  // 2. Ejecutarlo
  console.log('\n▶ Ejecutando el runner...')
  const resultText = await mgmtRun(
    'SELECT public.fn_run_delete_confirmation_test() AS result;',
    'SELECT RUNNER'
  )
  console.log('--- RESPUESTA ---')
  console.log(resultText)

  // 3. Interpretar
  let payload
  try {
    const parsed = JSON.parse(resultText)
    payload = Array.isArray(parsed) ? parsed[0]?.result : parsed?.result
  } catch {
    console.error('❌ No pude interpretar la respuesta')
    process.exitCode = 1
  }

  if (payload?.result === 'PASS') {
    const detail = payload.detail ?? []
    console.log('\n--- DETALLE ---')
    for (const item of detail) {
      console.log(`  ${item.ok ? '✅' : '❌'} ${item.assertion}${item.error ? `  (${item.error})` : ''}`)
    }
    console.log(`\n✅ PASS (${detail.length}/${detail.length})`)
  } else {
    console.error(`\n❌ FAIL: ${JSON.stringify(payload).slice(0, 600)}`)
    process.exitCode = 1
  }

  // 4. SIEMPRE borrar el runner y su ayudante (regla 11)
  console.log('\n▶ Borrando el runner...')
  await mgmtRun(
    `DROP FUNCTION IF EXISTS public.fn_run_delete_confirmation_test();
     DROP FUNCTION IF EXISTS public.fn_check_confirmation_word(text, text);`,
    'DROP RUNNER'
  )
  console.log('✅ Runner borrado')

  // 5. Verificar que no quedo nada
  const check = await mgmtRun(
    `SELECT count(*)::int AS remaining
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('fn_run_delete_confirmation_test', 'fn_check_confirmation_word');`,
    'VERIFY'
  )
  const remaining = JSON.parse(check)?.[0]?.remaining
  console.log(`verificacion: ${remaining} runner(s) residuales`)
  if (remaining !== 0) {
    console.error('❌ Quedo un runner residual')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
