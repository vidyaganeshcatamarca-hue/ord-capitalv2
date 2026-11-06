CREATE OR REPLACE FUNCTION public.fn_analizar_y_marcar_hormigas(p_limite_monto_individual numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; r_sub RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- Usamos una clave de datos en inglés en lugar de texto hardcoded
    UPDATE public.p_estructuras_egresos 
    SET es_hormiga = false, definicion_hormiga = NULL
    WHERE user_id = v_user_id AND padre_id IS NOT NULL 
      AND definicion_hormiga = 'auto_detected_high_freq';

    FOR r_sub IN 
        SELECT c.estructura_egreso_id AS subcuenta_id, COUNT(c.p_caja_id) as total_veces
        FROM public.p_caja c
        WHERE c.user_id = v_user_id AND c.tipo = 'expense' 
          AND c.fecha >= CURRENT_DATE - INTERVAL '30 days'
          AND c.valor_egreso <= p_limite_monto_individual
          AND c.estructura_egreso_id IS NOT NULL
        GROUP BY c.estructura_egreso_id
        HAVING COUNT(c.p_caja_id) >= 12 
    LOOP
        UPDATE public.p_estructuras_egresos 
        SET es_hormiga = true, definicion_hormiga = 'auto_detected_high_freq'
        WHERE estructura_id = r_sub.subcuenta_id AND user_id = v_user_id AND padre_id IS NOT NULL;
    END LOOP;
END;
$function$
