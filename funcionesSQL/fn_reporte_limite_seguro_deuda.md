CREATE OR REPLACE FUNCTION public.fn_reporte_limite_seguro_deuda()
 RETURNS TABLE(ingreso_mensual_promedio numeric, gastos_fijos_mensuales numeric, porcentaje_comprometido numeric, estado_alerta_key text, mensaje_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_ingreso numeric := 0;
    v_fijos numeric := 0;
    v_pct numeric := 0;
    v_estado text;
    v_mensaje text;
    v_f_inicio date;
    v_f_fin date;
    v_mes_truncado date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
    v_mes_truncado := date_trunc('month', v_f_inicio);

    SELECT COALESCE(SUM(valor_ingreso), 0) / 3.0 INTO v_ingreso
    FROM p_caja
    WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days';

    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_fijos
    FROM p_caja c
    JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id 
      AND c.tipo = 'expense'
      AND e.tipo_cupo = 'need'
      AND c.fecha BETWEEN v_f_inicio AND v_f_fin;

    v_fijos := v_fijos + COALESCE((
        SELECT SUM(monto_cuota) FROM p_compromisos_tarjeta
        WHERE user_id = v_user_id AND mes_periodo = v_mes_truncado
    ), 0);

    v_fijos := v_fijos + COALESCE((
        SELECT SUM(monto_cuota) FROM p_cuotas_detalle
        WHERE user_id = v_user_id AND pagado = false
          AND fecha_estimada_pago BETWEEN v_f_inicio AND v_f_fin
    ), 0);

    IF v_ingreso > 0 THEN
        v_pct := ROUND((v_fijos / v_ingreso) * 100, 2);
    END IF;

    IF v_pct > 60 THEN
        v_estado := 'state_critical';
        v_mensaje := 'alert_debt_critical';
    ELSIF v_pct > 45 THEN
        v_estado := 'state_warning';
        v_mensaje := 'alert_debt_warning';
    ELSE
        v_estado := 'state_safe';
        v_mensaje := 'alert_debt_healthy';
    END IF;

    RETURN QUERY SELECT v_ingreso, v_fijos, v_pct, v_estado, v_mensaje;
END;
$function$