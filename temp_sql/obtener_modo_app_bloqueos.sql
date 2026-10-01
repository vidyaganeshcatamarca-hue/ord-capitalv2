-- temp_sql/obtener_modo_app_bloqueos.sql
-- fn_obtener_modo_app() rev.4 (2026-10-01): agrega el filtro ANTI-ABUSO de
-- app_usuario_bloqueos. Prioridad: bloqueo > preferencia (voz_activada) > modo.
-- El resto de la logica es identica a la def vigente del 2026-09-30.

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

  -- Testing override: admin-enabled test users see advanced mode with the
  -- global switch still OFF.
  SELECT (valor = 'true') INTO v_testing_habilitado
  FROM app_global_config WHERE clave = 'modo_avanzado_testing';

  IF COALESCE(v_testing_habilitado, FALSE) AND v_email IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM app_global_config
      WHERE clave = 'modo_avanzado_testing_users'
        AND v_email = ANY (string_to_array(replace(valor, ' ', ''), ','))
    ) INTO v_testing_user;
    IF v_testing_user THEN
      v_modo_efectivo := 'avanzado';
    END IF;
  END IF;

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
    'avanzado_disponible',   COALESCE(v_avanzado_habilitado, false),
    'features',              COALESCE(v_features, '[]'::json)
  );
END;
$function$