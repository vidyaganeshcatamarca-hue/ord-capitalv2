// Genera temp_sql/87_modo_testing_por_feature.sql a partir de la definición
// VIVA de fn_obtener_modo_app, para que el resto del cuerpo no derive.
// Read-only sobre producción: solo lee pg_get_functiondef.
//
//   node temp_sql/87_gen_deploy.mjs
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

const rows = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_obtener_modo_app'`)
// pg_get_functiondef devuelve \r\n: normalizar SIEMPRE antes de la cirugía.
const live = rows[0].def.split('\r\n').join('\n').trimEnd() + '\n'

const ANCLA = '  WHERE f.activo = TRUE\n'
const count = live.split(ANCLA).length - 1
if (count !== 1) {
  throw new Error(
    `Ancla esperada 1 vez, encontrada ${count} vez/veces. ` +
      'Este generador es one-shot rev.5 -> rev.6: si la funcion viva ya tiene la regla ' +
      'de testing (o es mas nueva que rev.5), el archivo del deploy se edita a mano, no se regenera.'
  )
}

const NUEVA = `  -- rev.6: el flag de testing MANDA para los usuarios de la allowlist
  -- (reemplaza a activo por feature; activo_testing nace copiando activo).
  WHERE (CASE
          WHEN v_testing_disponible THEN COALESCE(f.activo_testing, FALSE)
          ELSE COALESCE(f.activo, FALSE)
        END)
`
const fn = live.replace(ANCLA, NUEVA)
if (fn === live) throw new Error('La cirugía no cambió nada')
if (!fn.includes('v_testing_disponible THEN COALESCE(f.activo_testing')) {
  throw new Error('La cirugía no quedó aplicada')
}

const header = `-- temp_sql/87_modo_testing_por_feature.sql
-- Modo testing por feature: cada fila de app_feature_flags decide por separado
-- si se habilita en producción (activo) y si se habilita en modo testing
-- (activo_testing).
--
-- Semantica acordada con el dueño: para los usuarios de la allowlist de testing
-- (app_global_config.modo_avanzado_testing_users con modo_avanzado_testing=true)
-- el flag de testing REEMPLAZA a activo. Se puede prender una feature solo para
-- testing y tambien apagarle a los testers algo que produccion ya tiene.
--
-- La semilla inicial copia activo -> activo_testing para que el dia 1 no cambie
-- nada y el dueño empiece a divergir celda por celda. Se ejecuta UNA sola vez:
-- el bloque DO detecta si la columna ya existia.
--
-- Rollback:
--   alter table public.app_feature_flags drop column activo_testing;
--   (y volver a desplegar fn_obtener_modo_app rev.5)
--
-- Verificacion: node tests/sql/run_modo_testing_flag_test.js

begin;

-- 1) Columna nueva + semilla unica desde activo.
do $do$
declare
  v_nueva boolean;
begin
  select not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'app_feature_flags'
       and column_name = 'activo_testing'
  ) into v_nueva;

  if v_nueva then
    alter table public.app_feature_flags
      add column activo_testing boolean not null default false;
    update public.app_feature_flags set activo_testing = coalesce(activo, false);
  end if;
end
$do$;

comment on column public.app_feature_flags.activo_testing is
  'Modo testing por feature: para usuarios de la allowlist de testing reemplaza a activo. Sin override para el resto.';

-- 2) fn_obtener_modo_app rev.6: el flag de testing manda para los testers.
`

const footer = `
-- 3) Post-chequeo: la funcion desplegada tiene la regla nueva.
do $do$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_obtener_modo_app'
       and p.prosrc like '%v_testing_disponible THEN COALESCE(f.activo_testing%'
  ) then
    raise exception 'fn_obtener_modo_app no quedo con la regla rev.6';
  end if;
end
$do$;

commit;
`

// pg_get_functiondef NO trae el punto y coma final: sin el, el DO siguiente
// es un error de sintaxis (42601).
const fnTerminada = fn.trimEnd().endsWith(';') ? fn : fn.trimEnd() + ';\n'

fs.writeFileSync('temp_sql/87_modo_testing_por_feature.sql', header + fnTerminada + footer)
console.log('OK temp_sql/87_modo_testing_por_feature.sql')
console.log('cuerpo copiado de la funcion viva, con 1 ancla reemplazada')
