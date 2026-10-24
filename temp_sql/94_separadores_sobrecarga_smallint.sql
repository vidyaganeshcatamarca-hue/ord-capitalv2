-- 94 — Misma relajación para la sobrecarga legacy (smallint)
--
-- El postcheck del deploy reveló DOS sobrecargas de fn_configurar_formato_moneda:
--   (text, integer,  text, text)   <- la que usa el front hoy
--   (text, smallint, text, text)   <- legacy, quedó con la validación vieja
-- Con las dos presentes PostgREST puede resolver a cualquiera, así que dejar una
-- exigiendo separadores haría fallar el guardado de decimales de la 2ª y 3ª moneda
-- de forma intermitente. Las dos pasan a aceptar separadores NULL.

-- Se recrea la legacy con el MISMO cuerpo relajado de la 93.
CREATE OR REPLACE FUNCTION public.fn_configurar_formato_moneda(
    p_moneda text,
    p_decimales smallint,
    p_separador_miles text,
    p_separador_decimal text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_moneda text;
    v_local text;
    v_miles text := NULLIF(TRIM(COALESCE(p_separador_miles, '')), '');
    v_decimal text := NULLIF(TRIM(COALESCE(p_separador_decimal, '')), '');
    v_entrada jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    v_moneda := UPPER(TRIM(COALESCE(p_moneda, '')));
    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_local
      FROM public.p_config_region r WHERE r.user_id = v_user_id;
    v_local := COALESCE(v_local, 'ARS');

    -- Guarda del contrato (peer): solo la local o una extra activa.
    IF v_moneda = '' THEN
        RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "moneda"}}';
    END IF;
    IF v_moneda <> v_local
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(public.fn_obtener_monedas_extra()) AS e(m)
           WHERE e.m = v_moneda
       ) THEN
        RAISE EXCEPTION '%', jsonb_build_object(
            'key', 'error_formato_moneda_moneda_invalida',
            'params', jsonb_build_object('moneda', v_moneda))::text;
    END IF;

    IF p_decimales IS NULL OR p_decimales < 0 OR p_decimales > 4 THEN
        RAISE EXCEPTION '%', jsonb_build_object(
            'key', 'error_formato_moneda_decimales',
            'params', jsonb_build_object('decimales', COALESCE(p_decimales, -1)))::text;
    END IF;

    -- S21: los separadores ya no son obligatorios. Sólo se validan si vienen, y
    -- nunca pueden compartir símbolo.
    IF v_miles IS NOT NULL AND v_decimal IS NOT NULL AND v_miles = v_decimal THEN
        RAISE EXCEPTION '{"key": "error_separators_must_differ", "params": {}}';
    END IF;

    v_entrada := jsonb_build_object('decimales', p_decimales);
    IF v_miles IS NOT NULL THEN
        v_entrada := v_entrada || jsonb_build_object('separador_miles', v_miles);
    END IF;
    IF v_decimal IS NOT NULL THEN
        v_entrada := v_entrada || jsonb_build_object('separador_decimal', v_decimal);
    END IF;

    UPDATE public.p_config_region
       SET monedas_formateo = jsonb_set(
           COALESCE(monedas_formateo, '{}'::jsonb),
           ARRAY[v_moneda],
           v_entrada,
           true)
     WHERE user_id = v_user_id;
    IF NOT FOUND THEN
        INSERT INTO public.p_config_region (user_id, monedas_formateo)
        VALUES (v_user_id, jsonb_build_object(v_moneda, v_entrada));
    END IF;

    RETURN (SELECT monedas_formateo FROM public.p_config_region WHERE user_id = v_user_id);
END;
$function$;
