CREATE OR REPLACE FUNCTION public.fn_reporte_proyectos_compartidos()
 RETURNS TABLE(proyecto_id bigint, nombre_proyecto text, icono text, presupuesto_meta numeric, fecha_objetivo date, total_aportado numeric, porcentaje_progreso numeric, aportes_creador numeric, aportes_invitado numeric, dias_restantes integer, estado_alerta_key text)
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
    WITH aportes AS (
        SELECT c.proyecto_id, SUM(c.valor_egreso) AS total,
               SUM(CASE WHEN hp.rol = 'creador' THEN c.valor_egreso ELSE 0 END) AS creador,
               SUM(CASE WHEN hp.rol = 'invitado' THEN c.valor_egreso ELSE 0 END) AS invitado
        FROM p_caja c JOIN p_hogar_participantes hp ON c.pagado_por_user_id = hp.user_id AND hp.hogar_id = v_hogar_id
        WHERE c.proyecto_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.tipo = 'expense'
        GROUP BY c.proyecto_id
    )
    SELECT p.proyecto_id, p.nombre_proyecto::text, COALESCE(p.icono, '🎯')::text, p.presupuesto_meta, p.fecha_objetivo,
           COALESCE(a.total, 0)::numeric AS total_aportado,
           CASE WHEN p.presupuesto_meta > 0 THEN LEAST(100, ROUND((COALESCE(a.total, 0) / p.presupuesto_meta) * 100, 2)) ELSE 0 END::numeric,
           COALESCE(a.creador, 0)::numeric, COALESCE(a.invitado, 0)::numeric,
           CASE WHEN p.fecha_objetivo IS NOT NULL THEN GREATEST(0, p.fecha_objetivo - CURRENT_DATE) ELSE NULL END::integer,
           CASE 
               WHEN p.fecha_objetivo IS NULL THEN 'no_date'::text
               WHEN (p.fecha_objetivo - CURRENT_DATE) > 60 THEN 'green'::text
               WHEN (p.fecha_objetivo - CURRENT_DATE) > 15 THEN 'yellow'::text
               ELSE 'red'::text
           END
    FROM p_proyectos_compartidos p LEFT JOIN aportes a ON p.proyecto_id = a.proyecto_id
    WHERE p.hogar_id = v_hogar_id ORDER BY p.creado_at DESC;
END;
$function$
