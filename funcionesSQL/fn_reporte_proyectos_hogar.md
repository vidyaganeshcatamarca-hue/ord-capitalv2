CREATE OR REPLACE FUNCTION public.fn_reporte_proyectos_hogar()
 RETURNS TABLE(proyecto_id bigint, nombre_proyecto text, presupuesto_meta numeric, total_gastado numeric, porcentaje_progreso numeric, estado_alerta_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    IF v_hogar_id IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT p.proyecto_id, p.nombre_proyecto, p.presupuesto_meta, COALESCE(SUM(c.valor_egreso), 0)::numeric AS gastado,
           CASE WHEN p.presupuesto_meta > 0 THEN ROUND((COALESCE(SUM(c.valor_egreso), 0) / p.presupuesto_meta) * 100, 2) ELSE 0 END::numeric AS progreso,
           CASE 
               WHEN COALESCE(SUM(c.valor_egreso), 0) > p.presupuesto_meta THEN 'red'::text
               WHEN COALESCE(SUM(c.valor_egreso), 0) > p.presupuesto_meta * 0.8 THEN 'yellow'::text
               ELSE 'green'::text
           END AS estado_alerta_key
    FROM p_proyectos_compartidos p LEFT JOIN p_caja c ON c.proyecto_id = p.proyecto_id AND c.tipo = 'expense'
    WHERE p.hogar_id = v_hogar_id GROUP BY p.proyecto_id, p.nombre_proyecto, p.presupuesto_meta ORDER BY p.creado_at DESC;
END;
$function$
