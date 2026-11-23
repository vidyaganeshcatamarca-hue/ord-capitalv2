/**
 * Read-only schema introspection for the loans / saneamiento module.
 *
 * Runs SELECT-only queries against the DEPLOYED Supabase database through the
 * Management API. It never issues DDL or DML, and it never prints credentials.
 *
 * Why this exists: `funcionesSQL/` mirrors and `start_info/tablas todas.md`
 * contradict each other (the dump lacks p_caja.moneda, p_cuotas_detalle.moneda
 * and p_ingresos.activo, all of which the SQL mirrors write). Neither artifact
 * is proof of the deployed schema, so it has to be read from the catalog.
 *
 * Usage:  node scripts/prestamos/introspect-schema.mjs
 * Env:    ACCESS_TOKEN (or SUPABASE_ACCESS_TOKEN) + SUPABASE_URL, loaded from
 *         the repo-root env file. Values are never logged.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TABLES = [
  'p_prestamos',
  'p_cuotas_detalle',
  'p_caja',
  'p_estructuras_egresos',
  'p_ingresos',
  'p_billeteras',
  'p_config_bola_nieve',
  'p_hogar_pagos',
]

const RPCS = [
  'fn_gestionar_deuda',
  'fn_registrar_pago_extra_deuda',
  'fn_simular_pago_extra',
  'fn_reporte_bola_nieve_estado',
  'fn_reporte_bola_nieve_estrategia',
  'fn_actualizar_estrategia_bola_nieve',
  'fn_reporte_plan_ataque_deudas',
  'fn_reporte_mapa_acreedores',
  'fn_reporte_limite_seguro_deuda',
  'fn_aviso_deuda_por_vencer',
  'fn_reporte_calendario_financiero',
  'fn_eliminar_movimiento_caja',
  'fn_editar_movimiento_caja',
  'fn_registrar_pago_pareja',
]

const sqlList = (values) => values.map((v) => `'${v}'`).join(', ')

function loadEnv() {
  const path = resolve(process.cwd(), '.env.local')
  const env = {}
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    throw new Error('No se pudo leer el archivo de entorno del repo (falta en la raiz del worktree).')
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function resolveAccess(env) {
  const token = env.ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    throw new Error('Falta ACCESS_TOKEN / SUPABASE_ACCESS_TOKEN en el entorno del repo.')
  }
  let ref = env.SUPABASE_PROJECT_REF || env.PROJECT_REF || ''
  if (!ref) {
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
    const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.(co|in)/i)
    if (!match) {
      throw new Error('No se pudo derivar el project ref: falta SUPABASE_URL o SUPABASE_PROJECT_REF.')
    }
    ref = match[1]
  }
  return { token, ref }
}

async function runQuery(endpoint, token, sql) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`)
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return text
  }
  return Array.isArray(parsed) ? parsed : (parsed.result ?? parsed)
}

function printRows(title, rows) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`)
  if (!Array.isArray(rows)) {
    console.log(rows)
    return
  }
  if (rows.length === 0) {
    console.log('(sin filas)')
    return
  }
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key))
      return set
    }, new Set()),
  )
  for (const row of rows) {
    const line = columns
      .map((column) => {
        const value = row[column]
        if (value === null || value === undefined) return ''
        const text = String(value).replace(/\s+/g, ' ')
        return text.length > 160 ? `${text.slice(0, 160)}…` : text
      })
      .join(' | ')
    console.log(line)
  }
  console.log(`-- ${rows.length} fila(s)`)
}

const QUERIES = [
  {
    id: 'A1 · columnas reales',
    sql: `
      SELECT table_name, ordinal_position, column_name, data_type,
             character_maximum_length AS max_len, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (${sqlList(TABLES)})
      ORDER BY table_name, ordinal_position`,
  },
  {
    id: 'A2 · constraints',
    sql: `
      SELECT t.relname AS tabla, c.contype, c.conname,
             pg_get_constraintdef(c.oid) AS definicion
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname IN (${sqlList(TABLES)})
      ORDER BY t.relname, c.contype, c.conname`,
  },
  {
    id: 'A2b · indices',
    sql: `
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename IN (${sqlList(TABLES)})
      ORDER BY tablename, indexname`,
  },
  {
    id: 'A3 · RLS policies',
    sql: `
      SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename IN (${sqlList(TABLES)})
      ORDER BY tablename, policyname`,
  },
  {
    id: 'A4 · RPCs desplegadas',
    sql: `
      SELECT p.proname, pg_get_function_arguments(p.oid) AS argumentos,
             pg_get_function_result(p.oid) AS retorno,
             p.prosecdef AS security_definer, p.provolatile AS volatilidad,
             pg_get_userbyid(p.proowner) AS owner
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (${sqlList(RPCS)})
      ORDER BY p.proname`,
  },
  {
    id: 'A5a · volumen de p_prestamos',
    sql: `
      SELECT count(*) AS total_filas,
             count(DISTINCT user_id) AS usuarios_distintos,
             count(*) FILTER (WHERE user_id IS NULL) AS filas_sin_dueno
      FROM public.p_prestamos`,
  },
  {
    id: 'A5b · distribucion de p_prestamos',
    sql: `
      SELECT estado, tipo_flujo, moneda_iso, count(*) AS filas
      FROM public.p_prestamos
      GROUP BY estado, tipo_flujo, moneda_iso
      ORDER BY filas DESC`,
  },
  {
    id: 'A5c · cuotas ligadas a prestamos',
    sql: `
      SELECT count(*) AS total_cuotas,
             count(*) FILTER (WHERE prestamo_id IS NOT NULL) AS con_prestamo_id,
             count(*) FILTER (WHERE tarjeta_id IS NOT NULL) AS con_tarjeta_id,
             count(*) FILTER (WHERE prestamo_id IS NOT NULL AND tarjeta_id IS NOT NULL) AS ambas
      FROM public.p_cuotas_detalle`,
  },
  {
    id: 'A6a · categorias de egreso relacionadas',
    sql: `
      SELECT nombre_cuenta, tipo_cupo, count(*) AS filas,
             count(DISTINCT user_id) AS usuarios
      FROM public.p_estructuras_egresos
      WHERE nombre_cuenta ILIKE '%deuda%'
         OR nombre_cuenta ILIKE '%prestamo%'
         OR nombre_cuenta ILIKE '%préstamo%'
         OR nombre_cuenta ILIKE 'cat_debt%'
         OR nombre_cuenta ILIKE 'cat_loan%'
      GROUP BY nombre_cuenta, tipo_cupo
      ORDER BY filas DESC`,
  },
  {
    id: 'A6b · fuentes de ingreso relacionadas',
    sql: `
      SELECT nombre, count(*) AS filas, count(DISTINCT user_id) AS usuarios
      FROM public.p_ingresos
      WHERE nombre ILIKE '%deuda%'
         OR nombre ILIKE '%prestamo%'
         OR nombre ILIKE '%préstamo%'
         OR nombre ILIKE '%loan%'
         OR nombre ILIKE '%debt%'
         OR nombre ILIKE '%income%'
      GROUP BY nombre
      ORDER BY filas DESC`,
  },
  {
    id: 'A6c · existencia de los 4 nombres aprobados',
    sql: `
      SELECT 'egreso' AS lado, nombre_cuenta AS nombre, count(*) AS filas
      FROM public.p_estructuras_egresos
      WHERE nombre_cuenta IN ('Deudas', 'Pago de Deudas', 'Préstamos otorgados', 'Prestamos otorgados')
      GROUP BY nombre_cuenta
      UNION ALL
      SELECT 'ingreso' AS lado, nombre, count(*) AS filas
      FROM public.p_ingresos
      WHERE nombre IN ('Ingreso x préstamo recibido', 'Cobro de préstamos', 'Cobro de prestamos')
      GROUP BY nombre`,
  },
  {
    id: 'A7 · vocabulario real de p_caja.tipo',
    sql: `
      SELECT tipo, count(*) AS filas
      FROM public.p_caja
      GROUP BY tipo
      ORDER BY filas DESC`,
  },
  {
    id: 'A8 · tablas del sistema de categorias i18n',
    sql: `
      SELECT (SELECT count(*) FROM public.p_categorias_plantilla) AS filas_plantilla,
             (SELECT count(*) FROM public.p_categorias_traduccion) AS filas_traduccion`,
  },
]

async function main() {
  const env = loadEnv()
  const { token, ref } = resolveAccess(env)
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`

  console.log(`Proyecto: ${ref}`)
  console.log(`Endpoint: ${endpoint}  (SELECT-only, sin DDL/DML)`)
  console.log(`Consultas: ${QUERIES.length}`)

  const failures = []
  for (const query of QUERIES) {
    try {
      const rows = await runQuery(endpoint, token, query.sql)
      printRows(query.id, rows)
    } catch (error) {
      failures.push({ id: query.id, error: String(error.message ?? error) })
      console.log(`\n[FALLO] ${query.id}\n  ${error.message ?? error}`)
    }
  }

  console.log('\n' + '='.repeat(78))
  if (failures.length === 0) {
    console.log('RESULTADO: todas las consultas respondieron')
  } else {
    console.log(`RESULTADO: ${failures.length} consulta(s) fallaron`)
    for (const failure of failures) console.log(` - ${failure.id}: ${failure.error}`)
    process.exitCode = 1
  }
}

await main()
