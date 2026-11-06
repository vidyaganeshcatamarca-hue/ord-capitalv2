CREATE OR REPLACE FUNCTION public.fn_reporte_simulador_escenarios()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_escudo_base int;
    v_liquidez_total numeric;
    v_gastos_fijos_mensuales numeric;
    v_ingreso_mensual_promedio numeric;
    v_escudo_sin_ingreso int;
    v_escudo_gastos_20 int;
    v_escudo_emergencia int;
    v_emergencia_monto numeric := 100000;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF; -- ⭐ CORREGIDO

    SELECT dias_supervivencia_deuda_total INTO v_escudo_base FROM public.fn_reporte_escudo_tiempo() LIMIT 1;
    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_liquidez_total FROM p_billeteras WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false;
    SELECT COALESCE(SUM(monto_mensual), 0) INTO v_gastos_fijos_mensuales FROM p_gastos_fijos_config WHERE user_id = v_user_id AND es_fijo = true;

    IF v_gastos_fijos_mensuales = 0 THEN
        SELECT COALESCE(SUM(valor_egreso), 0) / 3.0 INTO v_gastos_fijos_mensuales
        FROM p_caja c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'need' AND c.fecha >= CURRENT_DATE - INTERVAL '90 days';
    END IF;

    SELECT COALESCE(SUM(valor_ingreso), 0) / 3.0 INTO v_ingreso_mensual_promedio
    FROM p_caja WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days';

    IF v_gastos_fijos_mensuales > 0 THEN v_escudo_sin_ingreso := ROUND((v_liquidez_total / v_gastos_fijos_mensuales) * 30); ELSE v_escudo_sin_ingreso := 0; END IF;
    IF (v_gastos_fijos_mensuales * 1.20) > 0 THEN v_escudo_gastos_20 := ROUND((v_liquidez_total / (v_gastos_fijos_mensuales * 1.20)) * 30); ELSE v_escudo_gastos_20 := 0; END IF;
    IF v_gastos_fijos_mensuales > 0 THEN
        v_escudo_emergencia := ROUND(((v_liquidez_total - v_emergencia_monto) / v_gastos_fijos_mensuales) * 30);
        IF v_escudo_emergencia < 0 THEN v_escudo_emergencia := 0; END IF;
    ELSE v_escudo_emergencia := 0; END IF;

    RETURN jsonb_build_object(
        'escenario_base', jsonb_build_object(
            'nombre_key', 'sim_scenario_current_state',
            'descripcion_key', 'sim_scenario_current_state_desc',
            'dias', v_escudo_base,
            'params', '{}'::jsonb
        ),
        'escenario_sin_ingreso', jsonb_build_object(
            'nombre_key', 'sim_scenario_loss_main_income',
            'descripcion_key', 'sim_scenario_loss_main_income_desc',
            'dias', v_escudo_sin_ingreso,
            'impacto', v_escudo_base - v_escudo_sin_ingreso,
            'params', jsonb_build_object('days', v_escudo_sin_ingreso)
        ),
        'escenario_gastos_20', jsonb_build_object(
            'nombre_key', 'sim_scenario_fixed_costs_up_20',
            'descripcion_key', 'sim_scenario_fixed_costs_up_20_desc',
            'dias', v_escudo_gastos_20,
            'impacto', v_escudo_base - v_escudo_gastos_20,
            'params', jsonb_build_object('days', v_escudo_gastos_20)
        ),
        'escenario_emergencia', jsonb_build_object(
            'nombre_key', 'sim_scenario_emergency',
            'descripcion_key', 'sim_scenario_emergency_desc',
            'dias', v_escudo_emergencia,
            'impacto', v_escudo_base - v_escudo_emergencia,
            'params', jsonb_build_object('amount', ROUND(v_emergencia_monto, 0), 'days', v_escudo_emergencia)
        ),
        'datos_base', jsonb_build_object('liquidez_total', ROUND(v_liquidez_total, 2), 'gastos_fijos_mensuales', ROUND(v_gastos_fijos_mensuales, 2), 'ingreso_mensual_promedio', ROUND(v_ingreso_mensual_promedio, 2))
    );
END;
$function$
