/**
 * Second read-only pass: resolves the questions the first pass opened.
 *
 *  - Content of the dormant category i18n tables (plantilla / traduccion).
 *  - Whether the DEPLOYED function bodies match the SQL mirrors (the mirrors
 *    are known to be duplicated and contradictory).
 *  - The real dependency list: every deployed function whose body touches the
 *    tables this module is about to change.
 *  - Triggers on those same tables.
 *
 * Usage: node scripts/prestamos/introspect-deps.mjs
 */

import { readFileSync } from 'node:fs'
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
    console.log('(sin filas)')
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
          return t.length > 200 ? `${t.slice(0, 200)}…` : t
        })
        .join(' | '),
    )
  }
  console.log(`-- ${rows.length} fila(s)`)
}

const QUERIES = [
  {
    id: 'B1 · contenido de p_categorias_plantilla',
    sql: `SELECT key_categoria, tipo_cupo, icono_default, color_default, es_sistema
          FROM public.p_categorias_plantilla ORDER BY key_categoria`,
  },
  {
    id: 'B2 · contenido de p_categorias_traduccion',
    sql: `SELECT key_categoria, idioma, nombre_localizado, descripcion_localizada
          FROM public.p_categorias_traduccion ORDER BY key_categoria, idioma`,
  },
  {
    id: 'B3 · el cuerpo desplegado coincide con los espejos?',
    sql: `
      SELECT p.proname,
             length(p.prosrc) AS largo_body,
             position('NOT FOUND' IN p.prosrc) AS pos_not_found,
             position('GREATEST(0, saldo_actual - p_monto)' IN p.prosrc) AS pos_greatest,
             position('ILIKE ''%deuda%''' IN p.prosrc) AS pos_ilike_deuda,
             position('Pago de Deudas' IN p.prosrc) AS pos_pago_de_deudas,
             position('''prestamo_'' || ' IN p.prosrc) AS pos_prestamo_prefix
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('fn_registrar_pago_extra_deuda','fn_reporte_calendario_financiero',
                          'fn_reporte_bola_nieve_estrategia','fn_simular_pago_extra',
                          'fn_reporte_bola_nieve_estado')
      ORDER BY p.proname`,
  },
  {
    id: 'B4 · funciones desplegadas que tocan las tablas del modulo',
    sql: `
      SELECT p.proname, length(p.prosrc) AS largo
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND (p.prosrc ILIKE '%p_prestamos%'
             OR p.prosrc ILIKE '%p_cuotas_detalle%'
             OR p.prosrc ILIKE '%p_config_bola_nieve%'
             OR p.prosrc ILIKE '%config_bola_nieve%')
      ORDER BY p.proname`,
  },
  {
    id: 'B5 · triggers sobre las tablas del modulo',
    sql: `
      SELECT c.relname AS tabla, t.tgname, pg_get_triggerdef(t.oid) AS definicion
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
        AND c.relname IN ('p_prestamos','p_cuotas_detalle','p_config_bola_nieve','p_caja',
                          'p_estructuras_egresos','p_ingresos','p_billeteras')
      ORDER BY c.relname, t.tgname`,
  },
  {
    id: 'B6 · overloads de fn_editar_movimiento_caja',
    sql: `
      SELECT p.proname, pg_get_function_arguments(p.oid) AS argumentos
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_editar_movimiento_caja'
      ORDER BY length(pg_get_function_arguments(p.oid))`,
  },
]

for (const query of QUERIES) {
  try {
    printRows(query.id, await runQuery(query.sql))
  } catch (error) {
    console.log(`\n[FALLO] ${query.id}\n  ${error.message ?? error}`)
    process.exitCode = 1
  }
}
