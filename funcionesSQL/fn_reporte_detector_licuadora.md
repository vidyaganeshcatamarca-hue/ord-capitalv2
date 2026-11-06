CREATE OR REPLACE FUNCTION public.fn_reporte_detector_licuadora()
 RETURNS TABLE(rubro_nombre text, icono text, color text, gasto_mes_reciente numeric, gasto_mes_lejano numeric, variacion_nominal_pct numeric, inflacion_acumulada_pct numeric, variacion_real_pct numeric, veredicto_key text, estado_alerta_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint; v_mes_reciente date; v_mes_lejano date; r_cat RECORD;
    v_f_inicio_rec date; v_f_fin_rec date; v_f_inicio_lej date; v_f_fin_lej date;
    v_gasto_rec numeric; v_gasto_lej numeric; v_var_nom numeric; v_ipc_acumulado numeric; v_var_real numeric;
    v_veredicto text; v_estado text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio_rec, v_f_fin_rec FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE - INTERVAL '1 month');
    v_mes_reciente := date_trunc('month', v_f_inicio_rec);
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio_lej, v_f_fin_lej FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE - INTERVAL '7 months');
    v_mes_lejano := date_trunc('month', v_f_inicio_lej);

    FOR r_cat IN 
        WITH gastos_recientes AS (
            SELECT COALESCE(e.padre_id, e.estructura_id) as rubro_id, SUM(c.valor_egreso) as total_gastado
            FROM p_caja c JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
            WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY COALESCE(e.padre_id, e.estructura_id)
        )
        SELECT g.rubro_id, e.nombre_cuenta, e.icono, e.color 
        FROM gastos_recientes g 
        JOIN p_estructuras_egresos e ON g.rubro_id = e.estructura_id 
        WHERE e.tipo_cupo = 'need' 
        ORDER BY g.total_gastado DESC LIMIT 3
    LOOP
        SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_gasto_rec FROM p_caja c JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND COALESCE(e.padre_id, e.estructura_id) = r_cat.rubro_id AND c.fecha >= v_f_inicio_rec AND c.fecha <= v_f_fin_rec;
        SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_gasto_lej FROM p_caja c JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND COALESCE(e.padre_id, e.estructura_id) = r_cat.rubro_id AND c.fecha >= v_f_inicio_lej AND c.fecha <= v_f_fin_lej;

        IF v_gasto_lej > 0 THEN v_var_nom := (v_gasto_rec - v_gasto_lej) / v_gasto_lej; ELSE v_var_nom := 0; END IF;
        SELECT COALESCE((EXP(SUM(LN(1 + (valor_ipc / 100)))) - 1) * 100, 0) INTO v_ipc_acumulado FROM p_indices_precios WHERE to_date(anio::text || '-' || mes::text || '-01', 'YYYY-MM-DD') BETWEEN v_mes_lejano + INTERVAL '1 month' AND v_mes_reciente;
        IF v_ipc_acumulado > 0 OR v_var_nom <> 0 THEN v_var_real := ((1 + v_var_nom) / (1 + (v_ipc_acumulado / 100))) - 1; ELSE v_var_real := 0; END IF;

        IF v_gasto_lej = 0 THEN v_veredicto := 'alert_no_historical_data'; v_estado := 'neutral';
        ELSIF v_var_real < -0.05 THEN v_veredicto := 'alert_inflation_beating'; v_estado := 'green';
        ELSIF v_var_real <= 0.05 THEN v_veredicto := 'alert_inflation_stable'; v_estado := 'yellow';
        ELSE v_veredicto := 'alert_inflation_losing'; v_estado := 'red'; END IF;

        rubro_nombre := r_cat.nombre_cuenta; icono := r_cat.icono; color := r_cat.color;
        gasto_mes_reciente := v_gasto_rec; gasto_mes_lejano := v_gasto_lej;
        variacion_nominal_pct := ROUND(v_var_nom * 100, 2); inflacion_acumulada_pct := ROUND(v_ipc_acumulado, 2);
        variacion_real_pct := ROUND(v_var_real * 100, 2);
        veredicto_key := v_veredicto; estado_alerta_key := v_estado;
        RETURN NEXT;
    END LOOP;
END;
$function$