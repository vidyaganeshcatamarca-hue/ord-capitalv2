CREATE OR REPLACE FUNCTION public.fn_reporte_patrimonio_inversiones(p_cotizacion_usd numeric DEFAULT 1)
 RETURNS TABLE(total_pesos numeric, total_dolares numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Sincronización explícita agregada con los tipos de salida de fn_reporte_estado_inversiones
    RETURN QUERY
    SELECT 
        COALESCE(SUM(valor_actual_teorico), 0)::numeric as total_pesos,
        COALESCE(SUM(valor_actual_teorico / p_cotizacion_usd), 0)::numeric as total_dolares
    FROM public.fn_reporte_estado_inversiones();
END; $function$