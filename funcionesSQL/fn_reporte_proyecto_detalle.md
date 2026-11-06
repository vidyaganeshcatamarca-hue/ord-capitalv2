CREATE OR REPLACE FUNCTION public.fn_reporte_proyecto_detalle(p_proyecto_id bigint)
 RETURNS TABLE(nombre_proyecto text, presupuesto_meta numeric, total_gastado numeric, gastado_por_creador numeric, gastado_por_invitado numeric, balance_desvio numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT p.nombre_proyecto::text, p.presupuesto_meta::numeric, COALESCE(SUM(c.valor_egreso), 0)::numeric, 
           COALESCE(SUM(CASE WHEN c.pagado_por_user_id = (SELECT hp.user_id FROM p_hogar_participantes hp WHERE hp.hogar_id = p.hogar_id AND hp.rol = 'creador') THEN c.valor_egreso ELSE 0 END), 0)::numeric, 
           COALESCE(SUM(CASE WHEN c.pagado_por_user_id = (SELECT hp.user_id FROM p_hogar_participantes hp WHERE hp.hogar_id = p.hogar_id AND hp.rol = 'invitado') THEN c.valor_egreso ELSE 0 END), 0)::numeric, 
           (p.presupuesto_meta - COALESCE(SUM(c.valor_egreso), 0))::numeric
    FROM p_proyectos_compartidos p 
    LEFT JOIN p_caja c ON p.proyecto_id = c.proyecto_id 
    WHERE p.proyecto_id = p_proyecto_id AND p.hogar_id IN (SELECT hp.hogar_id FROM p_hogar_participantes hp WHERE hp.user_id = v_user_id) 
    GROUP BY p.proyecto_id, p.nombre_proyecto, p.presupuesto_meta;
END;
$function$