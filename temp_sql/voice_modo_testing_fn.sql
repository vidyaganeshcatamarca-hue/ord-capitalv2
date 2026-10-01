CREATE OR REPLACE FUNCTION public.fn_obtener_modo_app()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_modo_guardado       TEXT;
  v_avanzado_habilitado BOOLEAN;
  v_modo_efectivo       TEXT;
  v_email               TEXT;
  v_testing_habilitado  BOOLEAN;
  v_testing_user        BOOLEAN;
  v_features            JSON;
BEGIN
  -- Modo guardado del usuario
  SELECT modo_app, email INTO v_modo_guardado, v_email
  FROM usuarios WHERE auth_id = auth.uid();

  -- Switch global del admin
  SELECT (valor = 'true') INTO v_avanzado_habilitado
  FROM app_global_config WHERE clave = 'modo_avanzado_habilitado';

  -- Modo efectivo: si el admin desactivó, todos son 'simple'
  v_modo_efectivo := CASE
    WHEN v_avanzado_habilitado = TRUE THEN v_modo_guardado
    ELSE 'simple'
  END;

  -- Override de testing: si el admin encendio modo_avanzado_testing y el
  -- email esta en la lista, ve modo avanzado aunque el switch global siga OFF.
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

  -- Feature keys visibles para este modo
  SELECT json_agg(feature_key ORDER BY orden) INTO v_features
  FROM app_feature_flags
  WHERE activo = TRUE
    AND (
      modo_minimo = 'simple'
      OR v_modo_efectivo = 'avanzado'
    );

  RETURN json_build_object(
    'modo',                  v_modo_efectivo,
    'modo_guardado',         v_modo_guardado,
    'avanzado_disponible',   COALESCE(v_avanzado_habilitado, false),
    'features',              COALESCE(v_features, '[]'::json)
  );
END;
$function$
