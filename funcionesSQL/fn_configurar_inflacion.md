CREATE OR REPLACE FUNCTION public.fn_configurar_inflacion(p_pais text, p_fuente_inflacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_inflacion_6m numeric := 0;
    v_inflacion_12m numeric := 0;
    v_variacion_mensual_pct numeric := 0;
    v_moneda_pais text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_fuente_inflacion NOT IN ('api_automatica', 'proxy_dolar', 'desactivado') THEN
        RAISE EXCEPTION '{"key": "error_inflation_source_invalid", "params": {}}';
    END IF;

    IF p_fuente_inflacion = 'proxy_dolar' THEN
        -- Moneda local del pais desde el catalogo. Antes: CASE hardcodeado con ELSE 'ARS',
        -- que mandaba a un usuario de Espana a la cotizacion del peso argentino.
        SELECT p.moneda_local::text INTO v_moneda_pais
        FROM public.p_paises p
        WHERE p.codigo = p_pais AND p.soportado = true;

        IF v_moneda_pais IS NULL THEN
            RAISE EXCEPTION '{"key": "error_country_not_supported", "params": {}}';
        END IF;

        -- Fuente real: historico de cotizaciones. La tabla p_cotizaciones_dolar que consultaba
        -- la version anterior NO EXISTE en la base, asi que esto fallaba con 42P01 en runtime.
        v_variacion_mensual_pct := COALESCE(
            public.fn_calcular_inflacion_mensual(
                v_moneda_pais,
                EXTRACT(YEAR  FROM CURRENT_DATE)::int,
                EXTRACT(MONTH FROM CURRENT_DATE)::int),
            0
        );

        IF v_variacion_mensual_pct > 0 THEN
            v_inflacion_6m  := (POWER(1 + (v_variacion_mensual_pct / 100), 6)  - 1) * 100;
            v_inflacion_12m := (POWER(1 + (v_variacion_mensual_pct / 100), 12) - 1) * 100;
        END IF;
    END IF;

    INSERT INTO p_config_inflacion (user_id, pais, fuente_inflacion, inflacion_acumulada_6m, inflacion_acumulada_12m)
    VALUES (v_user_id, p_pais, p_fuente_inflacion, v_inflacion_6m, v_inflacion_12m)
    ON CONFLICT (user_id) DO UPDATE SET
        pais = EXCLUDED.pais,
        fuente_inflacion = EXCLUDED.fuente_inflacion,
        inflacion_acumulada_6m = EXCLUDED.inflacion_acumulada_6m,
        inflacion_acumulada_12m = EXCLUDED.inflacion_acumulada_12m,
        actualizado_at = now();

    RETURN jsonb_build_object('success_key', 'success_inflation_configured', 'params', '{}'::jsonb);
END;
$function$

-- NOTA: H1: ya no consulta p_cotizaciones_dolar (no existia) y resuelve la moneda por catalogo.
