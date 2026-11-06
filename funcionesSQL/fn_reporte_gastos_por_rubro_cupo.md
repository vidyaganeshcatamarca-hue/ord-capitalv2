CREATE OR REPLACE FUNCTION public.fn_reporte_gastos_por_rubro_cupo()
 RETURNS TABLE(nombre_cuenta text, tipo_cupo text, total_consumido numeric, icono text, color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_f_inicio date; v_f_fin date; v_hogar_id int8;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto();
    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;

    RETURN QUERY
    SELECT 
        padre.nombre_cuenta::text, MAX(padre.tipo_cupo)::text AS tipo_cupo, SUM(c.valor_egreso)::numeric AS total_consumido, MAX(padre.icono)::text AS icono, MAX(padre.color)::text AS color
    FROM public.p_caja c
    INNER JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    INNER JOIN public.p_estructuras_egresos padre ON padre.estructura_id = COALESCE(e.padre_id, e.estructura_id)
    WHERE c.fecha BETWEEN v_f_inicio AND v_f_fin
      AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
    GROUP BY padre.estructura_id, padre.nombre_cuenta
    ORDER BY total_consumido DESC;
END;
$function$