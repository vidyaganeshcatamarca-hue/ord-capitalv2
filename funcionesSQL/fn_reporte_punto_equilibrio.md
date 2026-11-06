CREATE OR REPLACE FUNCTION public.fn_reporte_punto_equilibrio()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint; v_hogar_id bigint; v_gastos_fijos_mensuales numeric := 0; v_pago_minimo_deudas numeric := 0;
    v_meta_minima_ahorro numeric := 0; v_punto_equilibrio numeric := 0; v_ingreso_promedio_actual numeric := 0;
    v_margen_maniobra numeric := 0; v_pct_ahorro_config numeric := 0; v_tendencia jsonb := '[]'::jsonb;
    v_mes date; v_f_inicio date; v_f_fin date; v_ingreso_mes numeric; v_punto_mes numeric; v_i int; v_veredicto text; v_mensaje_key text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    
    SELECT COALESCE(SUM(c.valor_egreso), 0) / 3.0 INTO v_gastos_fijos_mensuales FROM p_caja c
    INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo IN ('need', 'tithe') AND c.fecha >= CURRENT_DATE - INTERVAL '90 days';
    
    SELECT COALESCE((SELECT SUM(monto_cuota) / 3.0 FROM p_compromisos_tarjeta WHERE user_id = v_user_id AND mes_periodo >= date_trunc('month', CURRENT_DATE - INTERVAL '2 months')), 0) INTO v_pago_minimo_deudas;
    v_pago_minimo_deudas := v_pago_minimo_deudas + COALESCE((SELECT SUM(cd.monto_cuota) FROM p_cuotas_detalle cd WHERE cd.user_id = v_user_id AND cd.pagado = false AND cd.fecha_estimada_pago BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 month'), 0);
    
    SELECT COALESCE(porcentaje_ahorro, 0) INTO v_pct_ahorro_config FROM p_presupuestos_config WHERE user_id = v_user_id;
    SELECT COALESCE(SUM(valor_ingreso), 0) / 3.0 INTO v_ingreso_promedio_actual FROM p_caja WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days';
    
    v_meta_minima_ahorro := v_ingreso_promedio_actual * (v_pct_ahorro_config / 100.0);
    v_punto_equilibrio := v_gastos_fijos_mensuales + v_pago_minimo_deudas + v_meta_minima_ahorro;
    v_margen_maniobra := v_ingreso_promedio_actual - v_punto_equilibrio;
    
    FOR v_i IN 1..3 LOOP
        v_mes := date_trunc('month', CURRENT_DATE - (v_i || ' months')::interval);
        SELECT COALESCE(SUM(valor_ingreso), 0) INTO v_ingreso_mes FROM p_caja WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= v_mes AND fecha < v_mes + INTERVAL '1 month';
        SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_punto_mes FROM p_caja c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo IN ('need', 'tithe') AND c.fecha >= v_mes AND c.fecha < v_mes + INTERVAL '1 month';
        v_punto_mes := v_punto_mes + COALESCE((SELECT SUM(monto_cuota) FROM p_compromisos_tarjeta WHERE user_id = v_user_id AND mes_periodo = v_mes), 0);
        v_tendencia := v_tendencia || jsonb_build_array(jsonb_build_object('mes', to_char(v_mes, 'YYYY-MM'), 'ingreso_real', ROUND(v_ingreso_mes, 2), 'punto_equilibrio', ROUND(v_punto_mes, 2), 'superavit_deficit', ROUND(v_ingreso_mes - v_punto_mes, 2)));
    END LOOP;
    
    IF v_margen_maniobra > v_punto_equilibrio * 0.2 THEN 
        v_veredicto := 'comfortable'; v_mensaje_key := 'msg_equilibrium_comfortable';
    ELSIF v_margen_maniobra > 0 THEN 
        v_veredicto := 'tight'; v_mensaje_key := 'msg_equilibrium_tight';
    ELSE 
        v_veredicto := 'deficit'; v_mensaje_key := 'msg_equilibrium_deficit';
    END IF;
    
    RETURN jsonb_build_object(
        'actual', jsonb_build_object('punto_equilibrio', ROUND(v_punto_equilibrio, 2), 'ingreso_promedio', ROUND(v_ingreso_promedio_actual, 2), 'margen_maniobra', ROUND(v_margen_maniobra, 2), 'desglose', jsonb_build_object('gastos_fijos', ROUND(v_gastos_fijos_mensuales, 2), 'pago_minimo_deudas', ROUND(v_pago_minimo_deudas, 2), 'meta_ahorro', ROUND(v_meta_minima_ahorro, 2))),
        'veredicto', v_veredicto,
        'mensaje_key', v_mensaje_key,
        'tendencia_3m', v_tendencia
    );
END;
$function$
