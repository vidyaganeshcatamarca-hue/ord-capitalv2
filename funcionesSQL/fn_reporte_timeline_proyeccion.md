CREATE OR REPLACE FUNCTION public.fn_reporte_timeline_proyeccion()
 RETURNS TABLE(mes_vencimiento text, total_tarjetas numeric, total_prestamos numeric, total_mes_comprometido numeric, capacidad_techo_promedio numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_ingreso_prom_180 numeric; v_gasto_fijo_prom_180 numeric; v_capacidad_techo numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF; -- ⭐ CORREGIDO

    SELECT COALESCE(SUM(valor_ingreso), 0) / 6 INTO v_ingreso_prom_180 FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '180 days';
    SELECT COALESCE(SUM(valor_egreso), 0) / 6 INTO v_gasto_fijo_prom_180 FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= CURRENT_DATE - INTERVAL '180 days';

    v_capacidad_techo := v_ingreso_prom_180 - v_gasto_fijo_prom_180;
    IF v_capacidad_techo < 0 THEN v_capacidad_techo := 0; END IF;

    RETURN QUERY
    WITH serie_meses AS (SELECT to_char(generate_series(date_trunc('month', CURRENT_DATE), date_trunc('month', CURRENT_DATE + INTERVAL '11 months'), INTERVAL '1 month'), 'YYYY-MM') AS año_mes)
    SELECT s.año_mes::text AS mes_vencimiento,
           COALESCE(SUM(CASE WHEN cd.tarjeta_id IS NOT NULL THEN cd.monto_cuota ELSE 0 END), 0)::numeric AS total_tarjetas,
           COALESCE(SUM(CASE WHEN cd.prestamo_id IS NOT NULL THEN cd.monto_cuota ELSE 0 END), 0)::numeric AS total_prestamos,
           COALESCE(SUM(cd.monto_cuota), 0)::numeric AS total_mes_comprometido,
           v_capacidad_techo::numeric AS capacidad_techo_promedio
    FROM serie_meses s
    LEFT JOIN public.p_cuotas_detalle cd ON to_char(cd.fecha_estimada_pago, 'YYYY-MM') = s.año_mes AND cd.user_id = v_user_id AND cd.pagado = false
    LEFT JOIN public.p_prestamos pr ON cd.prestamo_id = pr.prestamo_id
    WHERE (pr.prestamo_id IS NULL OR pr.tipo_flujo = 'debo')
    GROUP BY s.año_mes ORDER BY s.año_mes ASC;
END;
$function$
