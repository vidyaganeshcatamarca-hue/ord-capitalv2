CREATE OR REPLACE FUNCTION public.fn_obtener_preferencias_usuario()
 RETURNS TABLE(tema text, tamanio_fuente text, ocultar_montos boolean, decimales_moneda_local smallint, decimales_segunda_moneda smallint, separador_miles text, separador_decimal text, primer_dia_semana smallint, formato_fecha text, formato_hora text, billetera_default_egreso bigint, billetera_default_ingreso bigint, categoria_default_sin_clasificar bigint, ocr_auto_aprobar boolean, ocr_confianza_minima smallint, voz_activada boolean, home_preferencias jsonb, orden_billeteras text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  INSERT INTO public.p_preferencias_usuario (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT
    p.tema,
    p.tamanio_fuente,
    p.ocultar_montos,
    p.decimales_moneda_local,
    p.decimales_segunda_moneda,
    p.separador_miles,
    p.separador_decimal,
    p.primer_dia_semana,
    p.formato_fecha,
    p.formato_hora,
    p.billetera_default_egreso,
    p.billetera_default_ingreso,
    p.categoria_default_sin_clasificar,
    p.ocr_auto_aprobar,
    p.ocr_confianza_minima,
    p.voz_activada,
    p.home_preferencias,
    p.orden_billeteras
  FROM public.p_preferencias_usuario p
  WHERE p.user_id = v_user_id;
END;
$function$

-- NOTA: Agrega formato_hora al retorno.
