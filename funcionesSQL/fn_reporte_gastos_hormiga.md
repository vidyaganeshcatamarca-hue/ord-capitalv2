CREATE OR REPLACE FUNCTION public.fn_reporte_gastos_hormiga()
 RETURNS TABLE(nombre_subcuenta text, rubro_padre text, total_acumulado numeric, cantidad_compras bigint)
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
    SELECT s.nombre_cuenta::text, r.nombre_cuenta::text AS rubro_padre, SUM(c.valor_egreso)::numeric AS total_acumulado, COUNT(c.p_caja_id)::int8 AS cantidad_compras
    FROM public.p_caja c
    INNER JOIN public.p_estructuras_egresos s ON c.estructura_egreso_id = s.estructura_id
    INNER JOIN public.p_estructuras_egresos r ON s.padre_id = r.estructura_id
    WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND s.es_hormiga = true AND c.fecha >= v_f_inicio AND c.fecha <= v_f_fin
    GROUP BY s.nombre_cuenta, r.nombre_cuenta
    ORDER BY total_acumulado DESC;
END;
$function$
