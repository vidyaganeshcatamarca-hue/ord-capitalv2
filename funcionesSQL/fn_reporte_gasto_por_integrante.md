CREATE OR REPLACE FUNCTION public.fn_reporte_gasto_por_integrante()
 RETURNS TABLE(nombre_integrante text, total_gastado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_f_inicio date; v_f_fin date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);

    RETURN QUERY
    SELECT 
        COALESCE(gf.nombre, 'no_assigned')::text,
        SUM(c.valor_egreso)::numeric
    FROM p_caja c
    LEFT JOIN p_grupo_familiar gf ON c.familiar_id = gf.familiar_id
    WHERE c.user_id = v_user_id 
      AND c.tipo = 'expense'
      AND c.fecha >= v_f_inicio AND c.fecha <= v_f_fin
    GROUP BY gf.nombre
    ORDER BY SUM(c.valor_egreso) DESC;
END;
$function$
