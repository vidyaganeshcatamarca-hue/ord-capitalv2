CREATE OR REPLACE FUNCTION public.fn_configurar_inflacion(p_pais text, p_fuente_inflacion text, p_inflacion_manual_anual_pct numeric DEFAULT NULL::numeric)
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
    v_manual numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- Fuentes validas: proxy_dolar (por defecto), manual, desactivado.
    -- 'api_automatica' se elimino: nunca estuvo implementada.
    IF p_fuente_inflacion NOT IN ('proxy_dolar', 'manual', 'desactivado') THEN
        RAISE EXCEPTION '{"key": "error_inflation_source_invalid", "params": {}}';
    END IF;

    v_manual := NULL;
    IF p_fuente_inflacion = 'manual' THEN
        IF p_inflacion_manual_anual_pct IS NULL OR p_inflacion_manual_anual_pct <= 0 THEN
            RAISE EXCEPTION '{"key": "error_inflation_manual_value_required", "params": {}}';
        END IF;
        v_manual := p_inflacion_manual_anual_pct;
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

        -- Fuente real: historico de cotizaciones.
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
    ELSIF p_fuente_inflacion = 'manual' THEN
        -- El usuario carga la inflacion anual acumulada hasta hoy. Se proyecta
        -- a 6m y 12m con la tasa diaria implicita, para que los dos campos
        -- tengan sentido (y no queden en 0).
        IF v_manual > 0 THEN
            v_inflacion_6m  := (POWER(1 + (v_manual / 100),  0.5) - 1) * 100;
            v_inflacion_12m := v_manual;
        END IF;
    END IF;

    INSERT INTO p_config_inflacion (
        user_id, pais, fuente_inflacion, inflacion_acumulada_6m, inflacion_acumulada_12m,
        p_inflacion_manual_anual_pct
    )
    VALUES (v_user_id, p_pais, p_fuente_inflacion, v_inflacion_6m, v_inflacion_12m, v_manual)
    ON CONFLICT (user_id) DO UPDATE SET
        pais = EXCLUDED.pais,
        fuente_inflacion = EXCLUDED.fuente_inflacion,
        inflacion_acumulada_6m = EXCLUDED.inflacion_acumulada_6m,
        inflacion_acumulada_12m = EXCLUDED.inflacion_acumulada_12m,
        p_inflacion_manual_anual_pct = EXCLUDED.p_inflacion_manual_anual_pct,
        actualizado_at = now();

    RETURN jsonb_build_object(
        'success_key', 'success_inflation_configured',
        'params', '{}'::jsonb,
        'fuente_inflacion', p_fuente_inflacion,
        'inflacion_6m', ROUND(v_inflacion_6m, 4),
        'inflacion_12m', ROUND(v_inflacion_12m, 4)
    );
END;
$function$;
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
