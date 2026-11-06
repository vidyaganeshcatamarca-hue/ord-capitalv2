CREATE OR REPLACE FUNCTION public.fn_reporte_bcg_estrategia_recorte()
 RETURNS TABLE(nombre_categoria text, rubro_padre text, coordenada_x smallint, coordenada_y numeric, cuadrante_key text, icono text, color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_f_inicio date; v_f_fin date; v_monto_promedio numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto();

    SELECT COALESCE(AVG(total_sub), 0) INTO v_monto_promedio
    FROM (SELECT SUM(valor_egreso) as total_sub FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'expense' AND fecha BETWEEN v_f_inicio AND v_f_fin GROUP BY estructura_egreso_id) sub;

    RETURN QUERY
    SELECT 
        e.nombre_cuenta::text, 
        CASE WHEN e.padre_id IS NULL THEN NULL ELSE padre.nombre_cuenta::text END AS rubro_padre_nombre,
        COALESCE(e.flexibilidad_recorte, 5)::int2 AS flexibilidad, 
        SUM(c.valor_egreso)::numeric AS monto_total,
        CASE 
            WHEN COALESCE(e.flexibilidad_recorte, 5) > 5 AND SUM(c.valor_egreso) > v_monto_promedio THEN 'bcg_star'::text
            WHEN COALESCE(e.flexibilidad_recorte, 5) > 5 AND SUM(c.valor_egreso) <= v_monto_promedio THEN 'bcg_cow'::text
            WHEN COALESCE(e.flexibilidad_recorte, 5) <= 5 AND SUM(c.valor_egreso) <= v_monto_promedio THEN 'bcg_dilemma'::text
            ELSE 'bcg_dog'::text
        END AS cuadrante_key,
        e.icono::text, 
        COALESCE(e.color, padre.color)::text AS color_final
    FROM public.p_caja c
    INNER JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    LEFT JOIN public.p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
    WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha BETWEEN v_f_inicio AND v_f_fin
      AND ((e.padre_id IS NOT NULL) OR (e.padre_id IS NULL AND NOT EXISTS (
          SELECT 1 FROM public.p_estructuras_egresos hijo WHERE hijo.padre_id = e.estructura_id AND hijo.user_id = e.user_id)))
    GROUP BY e.estructura_id, e.nombre_cuenta, padre.nombre_cuenta, e.flexibilidad_recorte, e.icono, e.color, padre.color, e.padre_id
    ORDER BY monto_total DESC;
END;
$function$
