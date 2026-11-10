CREATE OR REPLACE FUNCTION public.fn_calcular_inflacion_mensual(p_moneda_iso text, p_anio integer, p_mes integer)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_valor_inicio numeric;
    v_valor_fin numeric;
BEGIN
    SELECT valor_por_usd INTO v_valor_inicio
    FROM public.p_cotizaciones_historico
    WHERE moneda_iso = p_moneda_iso
      AND fecha < make_date(p_anio, p_mes, 1)
    ORDER BY fecha DESC
    LIMIT 1;

    SELECT valor_por_usd INTO v_valor_fin
    FROM public.p_cotizaciones_historico
    WHERE moneda_iso = p_moneda_iso
      AND fecha >= make_date(p_anio, p_mes, 1)
      AND fecha < make_date(p_anio, p_mes, 1) + INTERVAL '1 month'
    ORDER BY fecha DESC
    LIMIT 1;

    IF v_valor_inicio IS NULL OR v_valor_fin IS NULL OR v_valor_inicio = 0 THEN
        RETURN NULL;
    END IF;

    RETURN ROUND(((v_valor_fin - v_valor_inicio) / v_valor_inicio) * 100, 2);
END;
$function$;
DECLARE
    v_valor_inicio NUMERIC;
    v_valor_fin NUMERIC;
BEGIN
    -- 1. Obtener valor al final del mes anterior
    SELECT valor_por_usd INTO v_valor_inicio
    FROM public.p_cotizaciones_historico
    WHERE moneda_iso = p_moneda_iso
      AND fecha < make_date(p_anio, p_mes, 1)
    ORDER BY fecha DESC
    LIMIT 1;
    
    -- 2. Obtener valor al final del mes consultado
    SELECT valor_por_usd INTO v_valor_fin
    FROM public.p_cotizaciones_historico
    WHERE moneda_iso = p_moneda_iso
      AND fecha >= make_date(p_anio, p_mes, 1)
      AND fecha < make_date(p_anio, p_mes, 1) + INTERVAL '1 month'
    ORDER BY fecha DESC
    LIMIT 1;
    
    -- 3. Validar datos
    IF v_valor_inicio IS NULL OR v_valor_fin IS NULL OR v_valor_inicio = 0 THEN
        RETURN NULL; -- Retorna NULL si no hay datos suficientes
    END IF;
    
    -- 4. Calcular variación porcentual
    RETURN ROUND(((v_valor_fin - v_valor_inicio) / v_valor_inicio) * 100, 2);
END;
$function$