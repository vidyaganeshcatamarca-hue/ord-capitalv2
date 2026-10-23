// tests/sql/run_modo_testing_flag_test.js
// Verifica la regla "cada feature se habilita o deshabilita por separado en
// modo testing" (app_feature_flags.activo_testing).
//
// Regla del proyecto para tests de SQL: transaccional, todo dentro de
// BEGIN ... ROLLBACK, sin un solo dato residual y sin dejar funciones runner
// en Supabase. Las mutaciones de este test (flags, modo_app, switch global,
// bloqueos) se revierten al final.
//
//   node tests/sql/run_modo_testing_flag_test.js
//
// Sale con 1 si alguna aserción falla. Requiere SUPABASE_URL (o
// VITE_SUPABASE_URL) y ACCESS_TOKEN; si no están en el entorno se leen de
// .env.local en la raíz del repo.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

function loadEnv() {
  const env = { ...process.env }
  const envPath = path.join(repoRoot, '.env.local')
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !env[m[1]]) env[m[1]] = m[2]
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const PAT = env.ACCESS_TOKEN

if (!SUPABASE_URL || !PAT) {
  console.error('❌ Faltan SUPABASE_URL o ACCESS_TOKEN (entorno o .env.local)')
  process.exit(2)
}

const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

async function query(sql, label = 'query') {
  const res = await fetch(mgmtUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PAT}` },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`mgmt ${label} falló (${res.status}): ${text.slice(0, 900)}`)
    err.mgmt = true
    throw err
  }
  return text ? JSON.parse(text) : null
}

// --- Personas del test, resueltas en vivo desde la allowlist vigente --------
const LIST_SQL = `regexp_replace(valor, '\\s+', '', 'g')`

async function resolvePersonas() {
  const [row] = await query(
    `select
       (select u.auth_id::text from usuarios u
          join app_global_config g on g.clave = 'modo_avanzado_testing_users'
         where u.email is not null
           and u.email = any (string_to_array(${LIST_SQL}, ','))
         order by u.user_id limit 1) as tester,
       (select u.auth_id::text from usuarios u
          join app_global_config g on g.clave = 'modo_avanzado_testing_users'
         where u.email is not null
           and u.email <> all (string_to_array(${LIST_SQL}, ','))
         order by u.user_id limit 1) as prod`,
    'resolve personas'
  )
  if (!row?.tester || !row?.prod) {
    throw new Error(
      `No pude resolver las dos personas (tester=${row?.tester}, prod=${row?.prod}): ` +
        'hace falta al menos un usuario en la allowlist de testing y otro fuera de ella.'
    )
  }
  return row
}

// --- P1: la columna existe con la forma esperada ---------------------------
async function checkColumnShape() {
  const rows = await query(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = 'app_feature_flags'
        and column_name = 'activo_testing'`
  )
  const col = rows?.[0]
  const ok =
    !!col &&
    col.data_type === 'boolean' &&
    col.is_nullable === 'NO' &&
    String(col.column_default).startsWith('true')
  return {
    name: 'P1_columna_activo_testing',
    ok,
    detail: col ? JSON.stringify(col) : 'la columna no existe',
  }
}

// --- El test transaccional -------------------------------------------------
function buildScenarioSql(tester, prod) {
  return `
begin;

-- Personas aisladas: sin bloqueos por usuario dentro de la ventana del test.
delete from app_usuario_bloqueos
 where usuario_id in (select user_id from usuarios
                       where auth_id in ('${tester}'::uuid, '${prod}'::uuid));

-- Escenario deliberadamente cruzado entre producción y testing:
--   menu_inversiones  activo=false, activo_testing=true  -> sólo testing
--   menu_analisis     activo=true,  activo_testing=false -> sólo producción
--   config_datos      activo=false, activo_testing=true  -> sólo testing (avanzada)
update app_feature_flags set activo = false, activo_testing = true  where feature_key = 'menu_inversiones';
update app_feature_flags set activo = true,  activo_testing = false where feature_key = 'menu_analisis';
update app_feature_flags set activo = false, activo_testing = true  where feature_key = 'config_datos';

update usuarios set modo_app = 'avanzado'
 where auth_id in ('${tester}'::uuid, '${prod}'::uuid);

create temp table r (step text primary key, payload jsonb) on commit drop;

-- 1) Switch global APAGADO: el tester conserva el poder de entrar en avanzado.
update app_global_config set valor = 'false' where clave = 'modo_avanzado_habilitado';
set local request.jwt.claims = '{"sub":"${tester}"}';
insert into r select 'tester_switch_off', public.fn_obtener_modo_app()::jsonb;

-- 2) Switch global APAGADO: un usuario fuera de la lista queda en simple.
set local request.jwt.claims = '{"sub":"${prod}"}';
insert into r select 'prod_switch_off', public.fn_obtener_modo_app()::jsonb;

-- 3) Switch global PRENDIDO (el escenario que viene): producción ve activo.
update app_global_config set valor = 'true' where clave = 'modo_avanzado_habilitado';
insert into r select 'prod_avanzado', public.fn_obtener_modo_app()::jsonb;

-- 4) Tester en modo simple: el flag de testing también filtra lo simple.
set local request.jwt.claims = '{"sub":"${tester}"}';
update usuarios set modo_app = 'simple' where auth_id = '${tester}'::uuid;
insert into r select 'tester_simple', public.fn_obtener_modo_app()::jsonb;

create temp table expected on commit drop as
select
  (select array_agg(feature_key order by feature_key) from app_feature_flags
    where coalesce(activo, false)) as prod_avanzado,
  (select array_agg(feature_key order by feature_key) from app_feature_flags
    where coalesce(activo_testing, false)) as tester_avanzado,
  (select array_agg(feature_key order by feature_key) from app_feature_flags
    where coalesce(activo_testing, false) and modo_minimo = 'simple') as tester_simple;

select coalesce(jsonb_agg(jsonb_build_object(
         'name', name, 'ok', ok, 'detail', detail) order by name), '[]'::jsonb) as results
from (
  select 'T1_tester_entra_con_switch_apagado' as name,
         ((select payload from r where step = 'tester_switch_off') ->> 'modo' = 'avanzado')
         and ((select payload from r where step = 'tester_switch_off') ->> 'avanzado_disponible')::boolean as ok,
         (select payload::text from r where step = 'tester_switch_off') as detail
  union all
  select 'T2_prod_queda_en_simple_con_switch_apagado',
         ((select payload from r where step = 'prod_switch_off') ->> 'modo' = 'simple'),
         (select payload::text from r where step = 'prod_switch_off')
  union all
  select 'T3_tester_ve_feature_prendida_solo_en_testing',
         (select payload from r where step = 'tester_switch_off') -> 'features' ? 'menu_inversiones',
         'menu_inversiones: activo=false, activo_testing=true'
  union all
  select 'T4_tester_NO_ve_feature_apagada_en_testing',
         not ((select payload from r where step = 'tester_switch_off') -> 'features' ? 'menu_analisis'),
         'menu_analisis: activo=true, activo_testing=false (reemplazo, no suma)'
  union all
  select 'T5_tester_ve_feature_avanzada_prendida_en_testing',
         (select payload from r where step = 'tester_switch_off') -> 'features' ? 'config_datos',
         'config_datos: activo=false, activo_testing=true, modo_minimo=avanzado'
  union all
  select 'T6_prod_NO_ve_feature_prendida_solo_en_testing',
         not ((select payload from r where step = 'prod_avanzado') -> 'features' ? 'menu_inversiones'),
         'menu_inversiones con activo=false no debe filtrarse a producción'
  union all
  select 'T7_prod_ve_feature_prendida_en_produccion',
         (select payload from r where step = 'prod_avanzado') -> 'features' ? 'menu_analisis',
         'menu_analisis: activo=true'
  union all
  select 'T8_prod_NO_ve_feature_apagada_en_produccion',
         not ((select payload from r where step = 'prod_avanzado') -> 'features' ? 'config_datos'),
         'config_datos: activo=false'
  union all
  select 'T9_set_de_produccion_sin_cambios',
         coalesce((select array_agg(value order by value)
                     from jsonb_array_elements_text((select payload from r where step = 'prod_avanzado') -> 'features') value),
                  '{}'::text[])
         = coalesce((select prod_avanzado from expected), '{}'::text[]),
         'esperado: ' || coalesce((select array_to_string(prod_avanzado, ',') from expected), 'null')
  union all
  select 'T10_tester_simple_filtra_por_flag_de_testing',
         coalesce((select array_agg(value order by value)
                     from jsonb_array_elements_text((select payload from r where step = 'tester_simple') -> 'features') value
                    where value in (select feature_key from app_feature_flags where modo_minimo = 'simple')),
                  '{}'::text[])
         = coalesce((select tester_simple from expected), '{}'::text[]),
         'esperado: ' || coalesce((select array_to_string(tester_simple, ',') from expected), 'null')
  union all
  select 'T11_tester_set_completo_es_el_de_testing',
         coalesce((select array_agg(value order by value)
                     from jsonb_array_elements_text((select payload from r where step = 'tester_switch_off') -> 'features') value),
                  '{}'::text[])
         = coalesce((select tester_avanzado from expected), '{}'::text[]),
         'esperado: ' || coalesce((select array_to_string(tester_avanzado, ',') from expected), 'null')
) s;

rollback;
`
}

async function main() {
  const results = []
  results.push(await checkColumnShape())

  if (!results[0].ok) {
    // Sin la columna no tiene sentido correr el escenario: el RED ya está.
    console.log('❌ P1_columna_activo_testing')
    console.log('   ' + results[0].detail)
    console.log('\nRESULTADO: 0/1 PASS — la columna activo_testing no tiene la forma esperada.')
    process.exitCode = 1
    return
  }

  const { tester, prod } = await resolvePersonas()
  const rows = await query(buildScenarioSql(tester, prod), 'escenario')
  const scenario = rows?.[0]?.results ?? []
  results.push(...scenario)

  let failed = 0
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}`)
    if (!r.ok) {
      failed++
      console.log('   ' + String(r.detail).slice(0, 500))
    }
  }
  console.log(`\nRESULTADO: ${results.length - failed}/${results.length} PASS`)
  process.exitCode = failed === 0 ? 0 : 1
}

main().catch((err) => {
  console.error('💥 ' + err.message)
  process.exitCode = 2
})
