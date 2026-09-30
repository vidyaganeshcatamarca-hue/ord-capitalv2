-- Feature: intermediate tier (voice + quarantine) — authorized by owner in chat.
-- Order matters: ALTERs and flag updates run BEFORE the function that references pref_key.
BEGIN;

-- 1. Voice switch default OFF (users in advanced mode always see these features anyway)
ALTER TABLE public.p_preferencias_usuario
  ALTER COLUMN voz_activada SET DEFAULT false;
UPDATE public.p_preferencias_usuario SET voz_activada = false;

-- 2. Generic column linking a flag to the user preference that gates it
ALTER TABLE public.app_feature_flags ADD COLUMN IF NOT EXISTS pref_key text;

-- 3. Constraint now admits the intermediate tier, then reclassify quarantine
ALTER TABLE public.app_feature_flags
  DROP CONSTRAINT app_feature_flags_modo_minimo_check;
ALTER TABLE public.app_feature_flags
  ADD CONSTRAINT app_feature_flags_modo_minimo_check
  CHECK (modo_minimo IN ('simple', 'intermedio', 'avanzado'));

UPDATE public.app_feature_flags
SET modo_minimo = 'intermedio', pref_key = 'voz_activada'
WHERE feature_key = 'menu_cuarentena';

-- 4. New flag for the voice entry tab in AddMovementModal (same key)
INSERT INTO public.app_feature_flags (feature_key, modo_minimo, orden, activo, pref_key)
SELECT 'menu_carga_voz', 'intermedio', 2, true, 'voz_activada'
WHERE NOT EXISTS (SELECT 1 FROM public.app_feature_flags WHERE feature_key = 'menu_carga_voz');

-- 5. RPC replaced: intermediate features gated by the linked user preference.
--    Mode advanced users always get them, regardless of the switch.
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
  SELECT json_agg(f.feature_key ORDER BY f.orden) INTO v_features
  FROM app_feature_flags f
  WHERE f.activo = TRUE
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
$function$;

COMMIT;