// Estado REAL del backend de Inversiones en Supabase.
// READ-ONLY: solo consulta; no aplica ni modifica nada.
//
// Uso: node temp_sql/89_estado_inversiones.mjs
import fs from 'node:fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const REF = env.SUPABASE_URL.replace('https://', '').split('.')[0]
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/' + REF + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 800))
  return json
}

const filas = async (label, sql) => {
  const rows = await q(sql)
  console.log(`\n=== ${label} ===`)
  if (!rows.length) console.log('  (ninguno)')
  for (const r of rows) console.log('  ' + JSON.stringify(r))
  return rows
}

// 1) Funciones del modulo y sus firmas (overloads incluidos).
await filas(
  'FUNCIONES de Inversiones (con firma)',
  `select p.proname as fn,
          pg_get_function_identity_arguments(p.oid) as args,
          p.pronamespace::regnamespace::text as schema
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'fn_crear_inversion','fn_liquidar_inversion','fn_actualizar_valor_inversion',
        'fn_reporte_patrimonio_inversiones','fn_reporte_historial_inversiones',
        'fn_reporte_rendimiento_vs_inflacion','fn_reporte_distribucion_activos',
        'fn_obtener_config_inflacion','fn_configurar_inflacion'
      )
    order by p.proname, 2`
)

// 2) Triggers de la categoria intocable, saldo y cascada.
await filas(
  'TRIGGERS de Inversiones',
  `select t.tgname as trigger,
          c.relname as tabla,
          pg_get_triggerdef(t.oid) as def,
          t.tgenabled as enabled
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and (t.tgname like '%inversion%' or t.tgname like '%inversiones%')
    order by t.tgname`
)

// 3) Indice unico de la categoria de Inversiones.
await filas(
  'INDICES de la categoria de Inversiones',
  `select indexname, indexdef from pg_indexes
    where schemaname = 'public' and (indexname like '%inversion%' or indexdef ilike '%investment%')
    order by indexname`
)

// 4) Categorias de Inversiones por usuario (la clave propia y los nombres).
await filas(
  'CATEGORIAS de Inversiones (user_id, key, nombre, cupo)',
  `select user_id, key, nombre, tipo_cupo
     from p_estructuras_egresos
    where tipo_cupo = 'investment' or key = 'cat_investments_portfolio'
    order by user_id`
)

// 5) CHECK de la fuente de inflacion valida.
await filas(
  'CHECK de la fuente de inflacion',
  `select conname, pg_get_constraintdef(oid) as def
     from pg_constraint
    where conrelid = 'p_config_inflacion'::regclass
      and contype = 'c'`
)
