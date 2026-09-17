CREATE OR REPLACE FUNCTION public.fn_reporte_termometro_tarjeta(p_tarjeta_id bigint)
 RETURNS TABLE(nombre_tarjeta text, indice_estres numeric, capacidad_pago_promedio numeric, saldo_actual_total numeric, cuota_proxima numeric, estado_alerta text, estado_mensaje text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint; v_antiguedad int; v_ingreso_prom_180 numeric; v_gasto_fijo_prom_180 numeric;
    v_capacidad_pago_prom numeric; v_saldo_actual_total numeric; v_cuota_proxima numeric; v_nombre_tarjeta text; v_indice_estres numeric;
    v_f_inicio date; v_f_fin date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT (CURRENT_DATE - MIN(fecha))::int INTO v_antiguedad FROM public.p_caja WHERE user_id = v_user_id;
    
    IF v_antiguedad < 30 OR v_antiguedad IS NULL THEN
        RETURN QUERY SELECT 'pending'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 'green'::text, 'msg_learning_data'::text;
        RETURN;
    END IF;

    SELECT t.nombre_tarjeta INTO v_nombre_tarjeta FROM public.p_tarjetas_credito t WHERE t.tarjeta_id = p_tarjeta_id AND t.user_id = v_user_id;
    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_saldo_actual_total FROM public.p_billeteras WHERE user_id = v_user_id;
    SELECT COALESCE(SUM(valor_ingreso), 0) / 6 INTO v_ingreso_prom_180 FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '180 days';
    SELECT COALESCE(SUM(valor_egreso), 0) / 6 INTO v_gasto_fijo_prom_180 FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'expense' AND tarjeta_id IS NULL AND fecha >= CURRENT_DATE - INTERVAL '180 days';

    v_capacidad_pago_prom := v_ingreso_prom_180 - v_gasto_fijo_prom_180;
    
    -- Obtener las fechas del próximo ciclo presupuestario
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
    
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_cuota_proxima 
    FROM public.p_cuotas_detalle 
    WHERE tarjeta_id = p_tarjeta_id AND pagado = false 
      AND fecha_estimada_pago BETWEEN (v_f_fin + 1) AND (v_f_fin + INTERVAL '1 month');

    IF v_capacidad_pago_prom <= 0 THEN v_indice_estres := 100; ELSE v_indice_estres := ROUND((v_cuota_proxima / v_capacidad_pago_prom) * 100, 2); END IF;

    IF v_capacidad_pago_prom <= 0 THEN
        IF v_saldo_actual_total >= v_cuota_proxima THEN
            RETURN QUERY SELECT v_nombre_tarjeta, v_indice_estres, v_capacidad_pago_prom, v_saldo_actual_total, v_cuota_proxima, 'yellow'::text, 'msg_sufficient_balance_high_expenses'::text;
        ELSE
            RETURN QUERY SELECT v_nombre_tarjeta, 100::numeric, v_capacidad_pago_prom, v_saldo_actual_total, v_cuota_proxima, 'red'::text, 'msg_insufficient_balance_deficit'::text;
        END IF;
    ELSIF v_indice_estres > 30 THEN
        IF v_saldo_actual_total >= v_cuota_proxima THEN
            RETURN QUERY SELECT v_nombre_tarjeta, v_indice_estres, v_capacidad_pago_prom, v_saldo_actual_total, v_cuota_proxima, 'yellow'::text, 'msg_sufficient_balance_future_compromise'::text;
        ELSE
            RETURN QUERY SELECT v_nombre_tarjeta, v_indice_estres, v_capacidad_pago_prom, v_saldo_actual_total, v_cuota_proxima, 'red'::text, 'msg_high_quota_insufficient_balance'::text;
        END IF;
    ELSE
        RETURN QUERY SELECT v_nombre_tarjeta, v_indice_estres, v_capacidad_pago_prom, v_saldo_actual_total, v_cuota_proxima, 'green'::text, 'ok'::text;
    END IF;
END;
$function$

