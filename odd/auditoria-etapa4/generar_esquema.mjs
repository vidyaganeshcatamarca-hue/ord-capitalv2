// Genera start_info/esquema-presupuesto.md desde el catalogo REAL de Supabase.
//
// Por que: los tests que afirman estructura (DDL, indices, permisos) no pueden leer
// migraciones viejas ni ignoradas. Se leen del catalogo y se versiona una copia, con su
// huella, para que las pruebas sin conexion tengan una fuente de verdad actualizada.
//
// Solo lectura sobre la base. Se puede volver a correr y comparar.
//   node odd/auditoria-etapa4/generar_esquema.mjs
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const raiz = process.cwd()
const env = fs.readFileSync(path.join(raiz, '.env.local'), 'utf-8')
const leer = (clave) => {
  const m = env.match(new RegExp('^\\s*' + clave + '\\s*=\\s*(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}
const token = leer('ACCESS_TOKEN')
const url = leer('SUPABASE_URL')
const ref = url.replace(/^https?:\/\//, '').split('.')[0]

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

const TABLAS = ['p_presupuestos', 'p_presupuestos_config', 'p_presupuestos_historial']

const columnas = (await sql(`
  SELECT json_agg(c ORDER BY c.tabla, c.orden) AS c FROM (
    SELECT table_name AS tabla, ordinal_position AS orden, column_name AS columna,
           data_type AS tipo, is_nullable AS nulo, COALESCE(column_default, '') AS defecto
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY(ARRAY['${TABLAS.join("','")}'])
  ) c`))[0].c

const indices = (await sql(`
  SELECT json_agg(i ORDER BY i.tabla, i.nombre) AS i FROM (
    SELECT tablename AS tabla, indexname AS nombre, indexdef AS definicion
      FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = ANY(ARRAY['${TABLAS.join("','")}'])
  ) i`))[0].i

const rls = (await sql(`
  SELECT json_agg(r ORDER BY r.tabla) AS r FROM (
    SELECT c.relname AS tabla, c.relrowsecurity AS rls, c.relforcerowsecurity AS forzado
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = ANY(ARRAY['${TABLAS.join("','")}'])
  ) r`))[0].r

const politicas = (await sql(`
  SELECT json_agg(p ORDER BY p.tabla, p.nombre) AS p FROM (
    SELECT tablename AS tabla, policyname AS nombre, cmd AS comando, roles::text AS roles,
           COALESCE(qual, '') AS usando, COALESCE(with_check, '') AS con_control
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = ANY(ARRAY['${TABLAS.join("','")}'])
  ) p`))[0].p

const porTabla = (t) => columnas.filter((c) => c.tabla === t)
const lineas = []
lineas.push('# Esquema instalado del módulo de presupuesto')
lineas.push('')
lineas.push('Generado desde el catálogo real de Supabase con `odd/auditoria-etapa4/generar_esquema.mjs`.')
lineas.push('No se edita a mano: se vuelve a generar. Es la fuente que leen las pruebas de estructura,')
lineas.push('porque las migraciones de `temp_sql/` están ignoradas por git y nunca fueron la verdad.')
lineas.push('')
lineas.push(`Generado: ${new Date().toISOString()}`)
lineas.push('')

for (const t of TABLAS) {
  lineas.push(`## ${t}`)
  lineas.push('')
  lineas.push('| Columna | Tipo | Nulo | Defecto |')
  lineas.push('| --- | --- | --- | --- |')
  for (const c of porTabla(t)) {
    lineas.push(`| \`${c.columna}\` | ${c.tipo} | ${c.nulo === 'YES' ? 'sí' : 'no'} | ${c.defecto || '—'} |`)
  }
  lineas.push('')
  const idx = indices.filter((i) => i.tabla === t)
  if (idx.length) {
    lineas.push('Índices:')
    for (const i of idx) lineas.push(`- \`${i.nombre}\`: ${i.definicion}`)
    lineas.push('')
  }
  const r = rls.find((x) => x.tabla === t)
  if (r) {
    lineas.push(`RLS: ${r.rls ? 'encendido' : 'APAGADO'}${r.forzado ? ' y forzado' : ''}`)
    const pol = politicas.filter((p) => p.tabla === t)
    if (pol.length === 0) {
      lineas.push('')
      lineas.push('Sin políticas: ningún rol salvo el dueño puede leer ni escribir. El único acceso es por')
      lineas.push('las funciones `SECURITY DEFINER`.')
    } else {
      for (const p of pol) {
        lineas.push(`- política \`${p.nombre}\` (${p.comando}, roles ${p.roles}) usando: ${p.usando}`)
      }
    }
    lineas.push('')
  }
}

const texto = lineas.join('\n') + '\n'
const destino = path.join(raiz, 'start_info', 'esquema-presupuesto.md')
fs.writeFileSync(destino, texto, 'utf-8')
const sha = crypto.createHash('sha256').update(texto, 'utf8').digest('hex')
fs.writeFileSync(destino + '.sha256', `${sha}  esquema-presupuesto.md\n`, 'utf-8')
console.log('tablas:', TABLAS.length, '· columnas:', columnas.length, '· indices:', indices.length, '· politicas:', politicas.length)
console.log('archivo:', destino)
console.log('sha256:', sha)
