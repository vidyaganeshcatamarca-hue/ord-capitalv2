CREATE OR REPLACE FUNCTION public.fn_reporte_bcg_roi_emocional()
 RETURNS TABLE(nombre_categoria text, rubro_padre text, coordenada_x bigint, coordenada_y smallint, cuadrante_key text, icono text, color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_f_inicio date; v_f_fin date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto();

    RETURN QUERY
    SELECT 
        e.nombre_cuenta::text, 
        CASE WHEN e.padre_id IS NULL THEN NULL ELSE padre.nombre_cuenta::text END AS rubro_padre_nombre,
        COUNT(c.p_caja_id)::int8 AS frecuencia, 
        COALESCE(e.utilidad_placer, 5)::int2 AS placer,
        CASE 
            WHEN COUNT(c.p_caja_id) > 4 AND COALESCE(e.utilidad_placer, 5) > 5 THEN 'bcg_star'::text
            WHEN COUNT(c.p_caja_id) <= 4 AND COALESCE(e.utilidad_placer, 5) > 5 THEN 'bcg_cow'::text
            WHEN COUNT(c.p_caja_id) <= 4 AND COALESCE(e.utilidad_placer, 5) <= 5 THEN 'bcg_dilemma'::text
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
    GROUP BY e.estructura_id, e.nombre_cuenta, padre.nombre_cuenta, e.utilidad_placer, e.icono, e.color, padre.color, e.padre_id
    ORDER BY frecuencia DESC;
END;
$function$
