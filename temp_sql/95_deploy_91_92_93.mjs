// Deploy de las migraciones 91, 92 y 93 a Supabase.
// Autorizado por el dueño el 2026-10-24: "Los tienes que aplicar tú en supabase".
// (El commit y el push del CÓDIGO son de PI1; esto es sólo la base.)
//
// Cada archivo va en su propia transacción: si uno falla, no queda a medias.
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
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

const MIGRACIONES = [
  'temp_sql/91_distribucion_por_inversion.sql',
  'temp_sql/92_inflacion_prorrateada_por_dias.sql',
  'temp_sql/93_separadores_solo_locales.sql',
  'temp_sql/94_separadores_sobrecarga_smallint.sql',
]

console.log('Deploy a Supabase — 91, 92 y 93\n')

for (const archivo of MIGRACIONES) {
  const sql = fs.readFileSync(archivo, 'utf8')
  const r = await q('BEGIN;\n' + sql + '\nCOMMIT;')
  if (!r.ok) {
    console.log(`✗ ${archivo}`)
    console.log('  status:', r.status, JSON.stringify(r.json).slice(0, 600))
    console.log('\nSe aborta: las siguientes no se aplican.')
    process.exit(1)
  }
  console.log(`✓ ${archivo} (${sql.split('\n').length} líneas)`)
}

console.log('\n=== Postcheck (read-only) ===')

// 1) Las cuatro funciones existen con la firma esperada.
const firmas = await q(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as resultado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('fn_reporte_distribucion_activos',
                      'fn_reporte_detalle_inversion',
                      'fn_reporte_rendimiento_vs_inflacion',
                      'fn_configurar_formato_moneda')
  order by p.proname`)
console.log('FUNCIONES:', JSON.stringify(firmas.json))

// 2) La 91 devuelve una columna por inversión y el valor propio.
const dist = await q(`
  select pg_get_function_result(p.oid) as resultado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='fn_reporte_distribucion_activos'`)
const resDist = String(dist.json?.[0]?.resultado ?? '')
console.log('91 devuelve nombre_activo:', resDist.includes('nombre_activo'))
console.log('91 devuelve valor_propio :', resDist.includes('valor_propio'))
console.log('91 devuelve moneda      :', resDist.includes('moneda'))

// 3) La 92 prorratea por días y no usa la inflación de 6 meses en el real.
const def = await q(`
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public'
    and p.proname in ('fn_reporte_detalle_inversion','fn_reporte_rendimiento_vs_inflacion')`)
for (const fila of def.json ?? []) {
  const d = String(fila.def)
  console.log(
    `${fila.proname}: POWER/365 -> ${/POWER\(1 \+ \(v_inflacion_anual \/ 100\), v_dias_tenencia \/ 365\.0\)/.test(d)}` +
      ` | real sin inflacion_6m -> ${!/v_rendimiento_real := \(\(1 \+ \(v_rendimiento_nominal \/ 100\)\) \/ \(1 \+ \(v_inflacion_6m/.test(d)}`
  )
}

// 4) La 93: la RPC ya no exige separadores y no quedan en la 2ª/3ª moneda.
const rpcDef = await q(`
  select pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='fn_configurar_formato_moneda'`)
const dRpc = String(rpcDef.json?.[0]?.def ?? '')
console.log('93 RPC sin exigir separadores:', !/error_field_required', 'params': {'field': 'separadores'/.test(dRpc))

const sobrantes = await q(`
  select count(*)::int as n
  from public.p_config_region r, jsonb_each(r.monedas_formateo) e(key, value)
  where e.key <> COALESCE(r.moneda_default, 'ARS')
    and (e.value ? 'separador_miles' or e.value ? 'separador_decimal')`)
console.log('93 separadores sobrantes fuera de la local:', JSON.stringify(sobrantes.json))

const estado = await q(`
  select user_id, moneda_default, monedas_formateo
  from public.p_config_region order by user_id`)
console.log('ESTADO monedas_formateo:', JSON.stringify(estado.json))
