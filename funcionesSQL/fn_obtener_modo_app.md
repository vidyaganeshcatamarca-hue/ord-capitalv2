# fn_obtener_modo_app

## Descripcion
Devuelve el modo de experiencia (simple/avanzado) y la lista de features del usuario (VERIFIED 2026-10-16: definicion extraida real desde Supabase con pg_get_functiondef, byte-exacto con produccion; el espejo anterior tenia el bloque SQL desactualizado).

- Identidad con auth.uid() (regla del proyecto, SECURITY DEFINER).
- Global switch modo_avanzado_habilitado (app_global_config, clave/valor): si false → todos 'simple' (salvo testing, ver abajo).
- Testing (REPLANTEADO EN REV.5): modo_avanzado_testing + lista modo_avanzado_testing_users → el usuario de testing RECIBE LA CAPACIDAD de cambiar (avanzado_disponible=true); ya NO se fuerza el modo 'avanzado'. El parse de la lista hace strip de TODO whitespace con regexp_replace (una coma con salto de linea ya no rompe el match; fue el bug reportado 2026-10-19 con email agregado despues de un ENTER).
- Feature flags con modo_minimo: 'simple' siempre; 'avanzado' solo si modo efectivo avanzado; 'intermedio' con pref_key (hoy nivel queda sin uso practico: menu_carga_voz y menu_cuarentena pasaron a simple 2026-10-16 por decision del dueno S4).
- REV.4 (2026-10-01, anti-abuso): filtro NOT EXISTS contra app_usuario_bloqueos (usuario_id, feature_key, activo, hasta) — prioridad bloqueo > preferencia > modo (tambien en avanzado/testing). Tabla administrada a mano por el dueno desde el dashboard, RLS deny-all.
- REV.5 (2026-10-19, bug-4 tanda post-testing, autorizado): testing da la CAPACIDAD de cambiar (v_testing_disponible → avanzado_disponible OR switch); modo efectivo = guardado cuando switch ON **o** testing disponible; ya no fuerza 'avanzado'. Correlato: fn_activar_modo_avanzado rev.2 deja activar con switch OFF para testing users (su espejo tenia def vieja con esquema obsoleto, reescrito desde produccion). Test transaccional 5/5 PASS (temp_sql/fn_run_modo_testing_test.sql, ROLLBACK; cubre: disponible sin forzar, activar/desactivar con switch OFF para testing, no-disponible para no-testing).
- Nota de proceso [incidente 2026-10-16]: el espejo fue sobrescrito sin prosa por cp directo; encabezado RECONSTRUIDO de Engram; es la def byte-exacto con produccion (ver funcionesSQL/INCIDENTE-nota-actualizacion-espejos.md).

## Codigo SQL (definicion deployada rev.5, 2026-10-19)
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

  -- Effective mode: if the admin disabled it, everyone is 'simple'
  v_modo_efectivo := CASE
    WHEN v_avanzado_habilitado = TRUE THEN v_modo_guardado
    ELSE 'simple'
  END;

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
  WHERE f.activo = TRUE
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
$function$
