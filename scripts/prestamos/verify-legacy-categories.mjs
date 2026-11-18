/**
 * Verifies whether the two legacy category tables can be dropped safely.
 *
 * `p_categorias_plantilla` (9 rows) and `p_categorias_traduccion` (6 rows) are
 * a dormant, superseded prototype: they use Spanish keys and Spanish tipo_cupo
 * values ('necesidad', 'deseo') that would violate the live CHECK constraint on
 * p_estructuras_egresos, and no code path reads or writes them. The owner asked
 * to remove them so they stop misleading.
 *
 * DROP TABLE is destructive, so this pass proves the blast radius first and
 * dumps every row so the removal is reversible.
 *
 * Usage: node scripts/prestamos/verify-legacy-categories.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

function printRows(title, rows) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`)
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('(ninguno)')
    return
  }
  const columns = Array.from(rows.reduce((s, r) => (Object.keys(r).forEach((k) => s.add(k)), s), new Set()))
  for (const row of rows) {
    console.log(
      columns
        .map((c) => {
          const v = row[c]
          if (v === null || v === undefined) return ''
          const t = String(v).replace(/\s+/g, ' ')
          return t.length > 150 ? `${t.slice(0, 150)}…` : t
        })
        .join(' | '),
    )
  }
  console.log(`-- ${rows.length} fila(s)`)
}

const LEGACY = "('p_categorias_plantilla','p_categorias_traduccion')"

const CHECKS = [
  {
    id: 'C1 · FK que APUNTAN a las tablas legacy',
    sql: `
      SELECT con.conname, cl.relname AS tabla_hija, pg_get_constraintdef(con.oid) AS definicion
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_class ft ON ft.oid = con.confrelid
      WHERE con.contype = 'f' AND ft.relname IN ${LEGACY}`,
  },
  {
    id: 'C2 · vistas que las referencian',
    sql: `
      SELECT c.relname AS vista, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
        AND (pg_get_viewdef(c.oid) ILIKE '%p_categorias_plantilla%'
             OR pg_get_viewdef(c.oid) ILIKE '%p_categorias_traduccion%')`,
  },
  {
    id: 'C3 · funciones desplegadas que las mencionan',
    sql: `
      SELECT p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND (p.prosrc ILIKE '%p_categorias_plantilla%' OR p.prosrc ILIKE '%p_categorias_traduccion%')
      ORDER BY p.proname`,
  },
  {
    id: 'C4 · triggers en las tablas legacy',
    sql: `
      SELECT c.relname AS tabla, t.tgname
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relname IN ${LEGACY}`,
  },
  {
    id: 'C5 · RLS y politicas',
    sql: `
      SELECT c.relname AS tabla, c.relrowsecurity AS rls_activo,
             (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS politicas
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ${LEGACY}`,
  },
  {
    id: 'C6 · tamano y filas',
    sql: `
      SELECT 'p_categorias_plantilla' AS tabla, count(*) AS filas FROM public.p_categorias_plantilla
      UNION ALL
      SELECT 'p_categorias_traduccion', count(*) FROM public.p_categorias_traduccion`,
  },
  {
    id: 'C7 · fn_exportar_backup_maestro enumera tablas dinamicamente?',
    sql: `
      SELECT p.proname,
             position('information_schema' IN p.prosrc) AS usa_information_schema,
             position('pg_tables' IN p.prosrc) AS usa_pg_tables,
             position('categorias' IN p.prosrc) AS menciona_categorias,
             length(p.prosrc) AS largo
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('fn_exportar_backup_maestro','fn_exportar_datos_usuario_rango',
                          'fn_exportar_pasaporte_financiero','fn_borrar_datos_usuario',
                          'fn_clonar_usuario_admin')`,
  },
]

const results = {}
for (const check of CHECKS) {
  try {
    results[check.id] = await runQuery(check.sql)
    printRows(check.id, results[check.id])
  } catch (error) {
    console.log(`\n[FALLO] ${check.id}\n  ${error.message ?? error}`)
    process.exitCode = 1
  }
}

// ---- Preserve every row so the DROP is reversible ----
const plantilla = await runQuery(
  `SELECT key_categoria, tipo_cupo, icono_default, color_default, es_sistema
   FROM public.p_categorias_plantilla ORDER BY key_categoria`,
)
const traduccion = await runQuery(
  `SELECT key_categoria, idioma, nombre_localizado, descripcion_localizada
   FROM public.p_categorias_traduccion ORDER BY key_categoria, idioma`,
)

const literal = (value) =>
  value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`

const lines = []
lines.push('-- Respaldo de las tablas legacy de categorias, previo a su eliminacion.')
lines.push('-- Generado por scripts/prestamos/verify-legacy-categories.mjs')
lines.push(`-- Proyecto: ${ref}`)
lines.push(`-- p_categorias_plantilla: ${plantilla.length} filas`)
lines.push(`-- p_categorias_traduccion: ${traduccion.length} filas`)
lines.push('--')
lines.push('-- Reversion: ejecutar este bloque completo. Recrea ambas tablas y sus filas.')
lines.push('')
lines.push('CREATE TABLE IF NOT EXISTS public.p_categorias_plantilla (')
lines.push('    key_categoria text NOT NULL PRIMARY KEY,')
lines.push('    tipo_cupo     text NOT NULL,')
lines.push('    icono_default text,')
lines.push('    color_default text,')
lines.push('    es_sistema    boolean DEFAULT false')
lines.push(');')
lines.push('')
lines.push('CREATE TABLE IF NOT EXISTS public.p_categorias_traduccion (')
lines.push('    key_categoria          text NOT NULL,')
lines.push('    idioma                 text NOT NULL,')
lines.push('    nombre_localizado      text NOT NULL,')
lines.push('    descripcion_localizada text,')
lines.push('    PRIMARY KEY (key_categoria, idioma)')
lines.push(');')
lines.push('')
if (plantilla.length > 0) {
  lines.push('INSERT INTO public.p_categorias_plantilla')
  lines.push('    (key_categoria, tipo_cupo, icono_default, color_default, es_sistema)')
  lines.push('VALUES')
  lines.push(
    plantilla
      .map(
        (row) =>
          `    (${literal(row.key_categoria)}, ${literal(row.tipo_cupo)}, ${literal(
            row.icono_default,
          )}, ${literal(row.color_default)}, ${row.es_sistema === true})`,
      )
      .join(',\n') + ';',
  )
  lines.push('')
}
if (traduccion.length > 0) {
  lines.push('INSERT INTO public.p_categorias_traduccion')
  lines.push('    (key_categoria, idioma, nombre_localizado, descripcion_localizada)')
  lines.push('VALUES')
  lines.push(
    traduccion
      .map(
        (row) =>
          `    (${literal(row.key_categoria)}, ${literal(row.idioma)}, ${literal(
            row.nombre_localizado,
          )}, ${literal(row.descripcion_localizada)})`,
      )
      .join(',\n') + ';',
  )
  lines.push('')
}

const outPath = resolve(process.cwd(), 'start_info/rollback_categorias_legacy.sql')
writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
console.log(`\nRespaldo escrito: ${outPath} (${plantilla.length + traduccion.length} filas)`)
