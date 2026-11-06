CREATE OR REPLACE FUNCTION public.fn_reporte_historico_score(p_dias_atras integer DEFAULT 180)
 RETURNS TABLE(fecha date, score_global integer, estado_key text)
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
        h.fecha,
        h.score_global,
        CASE 
            WHEN h.score_global >= 80 THEN 'health_excellent'
            WHEN h.score_global >= 60 THEN 'health_healthy'
            WHEN h.score_global >= 40 THEN 'health_risk'
            ELSE 'health_critical'
        END
    FROM p_historico_score_salud h
    WHERE h.user_id = v_user_id
      AND h.fecha >= CURRENT_DATE - (p_dias_atras || ' days')::interval
    ORDER BY h.fecha ASC;
END;
$function$