-- temp_sql/87_modo_testing_por_feature.sql
-- Modo testing por feature: cada fila de app_feature_flags decide por separado
-- si se habilita en producción (activo) y si se habilita en modo testing
-- (activo_testing). Default true: una fila nueva nace visible para testing.
--
-- Semantica acordada con el dueño: para los usuarios de la allowlist de testing
-- (app_global_config.modo_avanzado_testing_users con modo_avanzado_testing=true)
-- el flag de testing REEMPLAZA a activo. Se puede prender una feature solo para
-- testing y tambien apagarle a los testers algo que produccion ya tiene.
--
-- La semilla inicial copia activo -> activo_testing para que el dia 1 no cambie
-- nada y el dueño empiece a divergir celda por celda. Se ejecuta UNA sola vez y
-- se marca en app_global_config (ff_testing_seed_aplicada): un re-run nunca pisa
-- las ediciones del dueño.
--
-- Rollback:
--   alter table public.app_feature_flags drop column activo_testing;
--   delete from public.app_global_config where clave = 'ff_testing_seed_aplicada';
--   (y volver a desplegar fn_obtener_modo_app rev.5)
--
-- Verificacion: node tests/sql/run_modo_testing_flag_test.js

begin;

-- 1) Columna nueva (default TRUE) + semilla unica desde activo.
-- El default true hace que toda fila NUEVA nazca visible para testing; la
-- semilla de abajo iguala las filas existentes a activo para que el dia 1 no
-- cambie el comportamiento de nadie.
-- La semilla se marca en app_global_config (ff_testing_seed_aplicada) en vez de
-- inferirse de "la columna ya existe": si la columna se creo a mano o quedo sin
-- semilla, un re-run la siembra igual, y despues nunca vuelve a pisar las
-- ediciones del dueño.
do $do$
declare
  v_sembrada boolean;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'app_feature_flags'
       and column_name = 'activo_testing'
  ) then
    alter table public.app_feature_flags
      add column activo_testing boolean not null default true;
  end if;

  -- Idempotente: deja el default en true aunque la columna ya existiera con false.
  alter table public.app_feature_flags
    alter column activo_testing set default true;

  select exists (
    select 1 from app_global_config
     where clave = 'ff_testing_seed_aplicada' and valor = 'true'
  ) into v_sembrada;

  if not v_sembrada then
    update public.app_feature_flags
       set activo_testing = coalesce(activo, false)
     where activo_testing is distinct from coalesce(activo, false);

    insert into app_global_config (clave, valor, descripcion)
    values ('ff_testing_seed_aplicada', 'true',
            'Marca interna: la semilla activo_testing = activo ya se aplico una vez (no pisar ediciones del dueño)')
    on conflict (clave) do update set valor = 'true';
  end if;
end
$do$;

comment on column public.app_feature_flags.activo_testing is
  'Modo testing por feature: para usuarios de la allowlist de testing reemplaza a activo. Sin override para el resto. Default true: una fila nueva nace visible para testing.';

-- 2) fn_obtener_modo_app rev.6: el flag de testing manda para los testers.
CREATE OR REPLACE FUNCTION public.fn_obtener_modo_app()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id             bigint;
  v_modo_guardado       TEXT;
  v_avanzado_habilitado BOOLEAN;
  v_modo_efectivo       TEXT;
  v_email               TEXT;
  v_testing_habilitado  BOOLEAN;
  v_testing_user        BOOLEAN;
  v_testing_disponible  BOOLEAN;
  v_features            JSON;
  v_voz_activada        BOOLEAN;
BEGIN
  -- Saved user mode + identity for the preference read
  SELECT user_id, modo_app, email INTO v_user_id, v_modo_guardado, v_email
  FROM usuarios WHERE auth_id = auth.uid();

  -- Global admin switch
  SELECT (valor = 'true') INTO v_avanzado_habilitado
  FROM app_global_config WHERE clave = 'modo_avanzado_habilitado';

  -- REV.5 testing: admin-enabled test users get the ABILITY to switch while
  -- the global switch stays OFF (owner bug-4 decision, 2026-10-19). The list
  -- parse strips ALL whitespace; commas with stray newlines no longer break it.
  SELECT (valor = 'true') INTO v_testing_habilitado
  FROM app_global_config WHERE clave = 'modo_avanzado_testing';

  IF COALESCE(v_testing_habilitado, FALSE) AND v_email IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM app_global_config
      WHERE clave = 'modo_avanzado_testing_users'
        AND v_email = ANY (string_to_array(regexp_replace(valor, '\s+', '', 'g'), ','))
    ) INTO v_testing_user;
  ELSE
    v_testing_user := FALSE;
  END IF;

  v_testing_disponible := COALESCE(v_testing_habilitado, FALSE) AND COALESCE(v_testing_user, FALSE);

  -- Effective mode: advanced when the admin switch is ON (saved preference)
  -- or when the user is an admin-enabled test user (ability, never forced).
  v_modo_efectivo := CASE
    WHEN (COALESCE(v_avanzado_habilitado, FALSE) OR v_testing_disponible) THEN v_modo_guardado
    ELSE 'simple'
  END;

  -- Preference that gates intermediate features (NULL-safe per row)
  SELECT COALESCE(voz_activada, FALSE) INTO v_voz_activada
  FROM p_preferencias_usuario WHERE user_id = v_user_id;

  -- Feature keys visible for this mode
  -- rev.4: NOT EXISTS = per-user block (owner-managed rows in
  -- app_usuario_bloqueos; activo=true and NOT already expired via hasta).
  -- Precedence: block > preference > mode (even advanced mode is blocked).
  SELECT json_agg(f.feature_key ORDER BY f.orden) INTO v_features
  FROM app_feature_flags f
  -- rev.6: el flag de testing MANDA para los usuarios de la allowlist
  -- (reemplaza a activo por feature; activo_testing nace copiando activo).
  WHERE (CASE
          WHEN v_testing_disponible THEN COALESCE(f.activo_testing, FALSE)
          ELSE COALESCE(f.activo, FALSE)
        END)
    AND NOT EXISTS (
      SELECT 1 FROM app_usuario_bloqueos b
      WHERE b.usuario_id = v_user_id
        AND b.feature_key = f.feature_key
        AND b.activo = TRUE
        AND (b.hasta IS NULL OR b.hasta > now())
    )
    AND (
      f.modo_minimo = 'simple'
      OR v_modo_efectivo = 'avanzado'
      OR (
        f.modo_minimo = 'intermedio'
        AND CASE f.pref_key
          WHEN 'voz_activada' THEN COALESCE(v_voz_activada, FALSE)
          -- Future gate: WHEN 'ocr_enabled' THEN <ocr pref read>
          ELSE FALSE
        END
      )
    );

  RETURN json_build_object(
    'modo',                  v_modo_efectivo,
    'modo_guardado',         v_modo_guardado,
    'avanzado_disponible',   COALESCE(v_avanzado_habilitado, false) OR COALESCE(v_testing_disponible, false),
    'features',              COALESCE(v_features, '[]'::json)
  );
END;
$function$;

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
