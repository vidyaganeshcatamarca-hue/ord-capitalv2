CREATE OR REPLACE FUNCTION public.fn_reporte_estado_inversiones()
 RETURNS TABLE(inversion_id bigint, nombre_activo text, tipo_activo text, monto_original numeric, valor_actual_teorico numeric, ganancia_acumulada numeric, estado_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT 
        i.inversion_id, 
        i.nombre_activo, 
        CASE 
            WHEN i.tasa_anual_tna > 0 THEN 'fixed_term'::text 
            ELSE 'variable'::text 
        END AS tipo_activo,
        i.monto_invertido_original AS monto_original,
        CASE 
            WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
            WHEN i.tasa_anual_tna > 0 THEN 
                (i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365))
            ELSE i.monto_invertido_original 
        END::numeric AS valor_actual_teorico,
        (CASE 
            WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
            WHEN i.tasa_anual_tna > 0 THEN 
                (i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365))
            ELSE i.monto_invertido_original 
        END - i.monto_invertido_original)::numeric AS ganancia_acumulada,
        -- ⭐ CORRECCIÓN I18N: Normalización de estado
        CASE 
            WHEN i.estado = 'activa' THEN 'active'::text
            WHEN i.estado = 'finalizada' THEN 'completed'::text
            ELSE i.estado::text
        END AS estado_key
    FROM public.p_inversiones i
    WHERE i.user_id = v_user_id;
END;
$function$