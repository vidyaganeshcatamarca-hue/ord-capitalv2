CREATE OR REPLACE FUNCTION public.fn_obtener_region_usuario()
 RETURNS TABLE(pais_codigo text, moneda_default text, idioma_default text, origen_pais text, confirmado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  -- Fila vacia si falta: el pais lo elige el usuario, no nosotros.
  INSERT INTO public.p_config_region (user_id, pais_codigo, moneda_default, idioma_default)
  VALUES (v_user_id, NULL, NULL, 'es')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT r.pais_codigo::text,
         r.moneda_default::text,
         r.idioma_default::text,
         r.origen_pais::text,
         (r.confirmado_at IS NOT NULL)
  FROM public.p_config_region r
  WHERE r.user_id = v_user_id;
END;
$function$
