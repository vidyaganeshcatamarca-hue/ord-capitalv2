CREATE OR REPLACE FUNCTION public.fn_reporte_variacion_intermensual()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint; v_hogar_id bigint;
    v_mes_anterior date; v_mes_antepasado date;
    v_f_inicio_act date; v_f_fin_act date;
    v_f_inicio_ant date; v_f_fin_ant date;
    v_f_inicio_antep date; v_f_fin_antep date;
    v_total_actual numeric := 0; v_total_anterior numeric := 0; v_total_antepasado numeric := 0;
    v_variacion_1m numeric := 0; v_variacion_3m numeric := 0;
    v_top_subidas jsonb; v_top_bajadas jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio_act, v_f_fin_act FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
    v_mes_anterior := v_f_inicio_act - INTERVAL '10 days';
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio_ant, v_f_fin_ant FROM public.fn_obtener_fechas_ciclo_presupuesto(v_mes_anterior);
    v_mes_antepasado := v_f_inicio_ant - INTERVAL '10 days';
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio_antep, v_f_fin_antep FROM public.fn_obtener_fechas_ciclo_presupuesto(v_mes_antepasado);
    
    SELECT COALESCE(SUM(valor_egreso), 0) INTO v_total_actual FROM p_caja WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= v_f_inicio_act AND fecha <= v_f_fin_act;
    SELECT COALESCE(SUM(valor_egreso), 0) INTO v_total_anterior FROM p_caja WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= v_f_inicio_ant AND fecha <= v_f_fin_ant;
    SELECT COALESCE(SUM(valor_egreso), 0) INTO v_total_antepasado FROM p_caja WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= v_f_inicio_antep AND fecha <= v_f_fin_antep;
    
    IF v_total_anterior > 0 THEN v_variacion_1m := ((v_total_actual - v_total_anterior) / v_total_anterior) * 100; END IF;
    IF v_total_antepasado > 0 THEN v_variacion_3m := ((v_total_actual - ((v_total_anterior + v_total_antepasado) / 2.0)) / ((v_total_anterior + v_total_antepasado) / 2.0)) * 100; END IF;
    
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.variacion_abs DESC), '[]'::jsonb) INTO v_top_subidas
    FROM (SELECT e.nombre_cuenta AS categoria, e.icono, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) AS mes_actual, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) AS mes_anterior, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) AS variacion_abs, CASE WHEN COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) > 0 THEN ROUND(((COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0)) / COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 1)) * 100, 2) ELSE 0 END AS variacion_pct FROM p_caja c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha >= v_f_inicio_ant GROUP BY e.estructura_id, e.nombre_cuenta, e.icono HAVING COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) > 0 ORDER BY variacion_abs DESC LIMIT 5) t;
    
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.variacion_abs ASC), '[]'::jsonb) INTO v_top_bajadas
    FROM (SELECT e.nombre_cuenta AS categoria, e.icono, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) AS mes_actual, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) AS mes_anterior, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) AS variacion_abs, CASE WHEN COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) > 0 THEN ROUND(((COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0)) / COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 1)) * 100, 2) ELSE 0 END AS variacion_pct FROM p_caja c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha >= v_f_inicio_ant GROUP BY e.estructura_id, e.nombre_cuenta, e.icono HAVING COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) < 0 ORDER BY variacion_abs ASC LIMIT 5) t;
    
    RETURN jsonb_build_object(
        'totales', jsonb_build_object('mes_actual', ROUND(v_total_actual, 2), 'mes_anterior', ROUND(v_total_anterior, 2), 'mes_antepasado', ROUND(v_total_antepasado, 2)),
        'variaciones', jsonb_build_object('vs_mes_anterior_pct', ROUND(v_variacion_1m, 2), 'vs_promedio_3m_pct', ROUND(v_variacion_3m, 2)),
        'top_subidas', v_top_subidas, 'top_bajadas', v_top_bajadas,
        'insight', CASE 
            WHEN v_variacion_1m > 20 THEN 'insight_expenses_up'
            WHEN v_variacion_1m < -10 THEN 'insight_expenses_down'
            ELSE 'insight_expenses_stable'
        END
    );
END;
$function$