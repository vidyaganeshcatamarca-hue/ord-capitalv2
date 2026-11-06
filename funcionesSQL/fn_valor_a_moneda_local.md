CREATE OR REPLACE FUNCTION public.fn_valor_a_moneda_local(p_monto numeric, p_moneda text, p_user_id bigint)
 RETURNS TABLE(valor numeric, tasa numeric, moneda text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_moneda_local text;
    v_rate_origen numeric;
    v_rate_local numeric;
BEGIN
    -- Moneda local del pais confirmado; sin configuracion regional, ARS (comportamiento historico).
    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_moneda_local
    FROM public.p_config_region r WHERE r.user_id = p_user_id;
    v_moneda_local := COALESCE(v_moneda_local, 'ARS');

    IF p_monto IS NULL OR p_monto = 0 OR p_moneda IS NULL THEN
        RETURN QUERY SELECT NULL::numeric AS valor, NULL::numeric AS tasa, v_moneda_local::text AS moneda;
        RETURN;
    END IF;

    IF p_moneda = v_moneda_local THEN
        RETURN QUERY SELECT p_monto, 1.0, v_moneda_local;
        RETURN;
    END IF;

    SELECT d.valor_por_usd INTO v_rate_origen FROM public.p_divisas d WHERE d.nombre = p_moneda;
    SELECT d.valor_por_usd INTO v_rate_local FROM public.p_divisas d WHERE d.nombre = v_moneda_local;
    IF v_rate_origen IS NULL OR v_rate_local IS NULL OR v_rate_origen = 0 OR v_rate_local = 0 THEN
        -- Cotizacion no disponible: no se congela nada, nunca inventar.
        RETURN QUERY SELECT NULL::numeric AS valor, NULL::numeric AS tasa, v_moneda_local::text AS moneda;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT ROUND(p_monto * (v_rate_local / v_rate_origen), 2),
           (v_rate_local / v_rate_origen),
           v_moneda_local;
END;
$function$

