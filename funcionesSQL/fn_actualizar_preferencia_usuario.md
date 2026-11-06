CREATE OR REPLACE FUNCTION public.fn_actualizar_preferencia_usuario(p_tema text DEFAULT NULL::text, p_tamanio_fuente text DEFAULT NULL::text, p_ocultar_montos boolean DEFAULT NULL::boolean, p_decimales_moneda_local smallint DEFAULT NULL::smallint, p_decimales_segunda_moneda smallint DEFAULT NULL::smallint, p_separador_miles text DEFAULT NULL::text, p_separador_decimal text DEFAULT NULL::text, p_primer_dia_semana smallint DEFAULT NULL::smallint, p_formato_fecha text DEFAULT NULL::text, p_formato_hora text DEFAULT NULL::text, p_billetera_default_egreso bigint DEFAULT NULL::bigint, p_billetera_default_ingreso bigint DEFAULT NULL::bigint, p_categoria_default_sin_clasificar bigint DEFAULT NULL::bigint, p_ocr_auto_aprobar boolean DEFAULT NULL::boolean, p_ocr_confianza_minima smallint DEFAULT NULL::smallint, p_voz_activada boolean DEFAULT NULL::boolean, p_home_preferencias jsonb DEFAULT NULL::jsonb, p_orden_billeteras text DEFAULT NULL::text)
 RETURNS void
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

  UPDATE public.p_preferencias_usuario
  SET
    tema = COALESCE(p_tema, tema),
    tamanio_fuente = COALESCE(p_tamanio_fuente, tamanio_fuente),
    ocultar_montos = COALESCE(p_ocultar_montos, ocultar_montos),
    decimales_moneda_local = COALESCE(p_decimales_moneda_local, decimales_moneda_local),
    decimales_segunda_moneda = COALESCE(p_decimales_segunda_moneda, decimales_segunda_moneda),
    separador_miles = COALESCE(p_separador_miles, separador_miles),
    separador_decimal = COALESCE(p_separador_decimal, separador_decimal),
    primer_dia_semana = COALESCE(p_primer_dia_semana, primer_dia_semana),
    formato_fecha = COALESCE(p_formato_fecha, formato_fecha),
    formato_hora = COALESCE(p_formato_hora, formato_hora),
    billetera_default_egreso = CASE
      WHEN p_billetera_default_egreso = -1 THEN NULL
      WHEN p_billetera_default_egreso IS NOT NULL THEN p_billetera_default_egreso
      ELSE billetera_default_egreso
    END,
    billetera_default_ingreso = CASE
      WHEN p_billetera_default_ingreso = -1 THEN NULL
      WHEN p_billetera_default_ingreso IS NOT NULL THEN p_billetera_default_ingreso
      ELSE billetera_default_ingreso
    END,
    categoria_default_sin_clasificar = COALESCE(p_categoria_default_sin_clasificar, categoria_default_sin_clasificar),
    ocr_auto_aprobar = COALESCE(p_ocr_auto_aprobar, ocr_auto_aprobar),
    ocr_confianza_minima = COALESCE(p_ocr_confianza_minima, ocr_confianza_minima),
    voz_activada = COALESCE(p_voz_activada, voz_activada),
    home_preferencias = COALESCE(p_home_preferencias, home_preferencias),
    orden_billeteras = COALESCE(p_orden_billeteras, orden_billeteras),
    actualizado_at = now()
  WHERE user_id = v_user_id;
END;
$function$

-- NOTA: Agrega p_formato_hora al final de la firma.
