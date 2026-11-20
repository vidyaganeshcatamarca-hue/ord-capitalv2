-- Bloque F · recategorizar un movimiento de un ciclo cerrado mueve el gasto entre padres,
-- sin tocar el cierre ni crear movimientos. Todo en una transaccion que revierte.
DO $blk$
DECLARE
    v jsonb := '[]'::jsonb;
    h_alim bigint; h_salud bigint; h_transp bigint;
    caja bigint;
    caja2 bigint;
    act date := date_trunc('month', CURRENT_DATE)::date;
    n int; aj numeric; aj2 numeric;
BEGIN
    PERFORM set_config('request.jwt.claims',
      (SELECT json_build_object('sub', u.auth_id)::text FROM public.usuarios u WHERE u.user_id = 1), true);
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 1, fecha_activacion_base_cero = NULL WHERE user_id = 1;

    -- hijos: uno de Alimentos (2), uno de Salud (19), uno de Transporte (23)
    SELECT e.estructura_id INTO h_alim FROM public.p_estructuras_egresos e WHERE e.padre_id = 2 ORDER BY e.estructura_id LIMIT 1;
    SELECT e.estructura_id INTO h_salud FROM public.p_estructuras_egresos e WHERE e.padre_id = 19 ORDER BY e.estructura_id LIMIT 1;
    SELECT e.estructura_id INTO h_transp FROM public.p_estructuras_egresos e WHERE e.padre_id = 23 ORDER BY e.estructura_id LIMIT 1;

    -- Octubre 2025: ciclo cerrado con un gasto de 10.000 en Alimentos.
    INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla)
    VALUES (1, 2, '2025-10-01', 100000, 1);
    INSERT INTO public.p_caja (user_id, estructura_egreso_id, fecha, tipo, moneda, valor_egreso, valor_local)
    VALUES (1, h_alim, '2025-10-10', 'expense', 'ARS', 10000, 10000)
    RETURNING p_caja_id INTO caja;
    PERFORM public.fn_cerrar_ciclo_presupuesto('2025-10-01');

    -- 1 · mismo padre: Alimentos -> otra hija de Alimentos. No mueve plata entre padres.
    UPDATE public.p_caja SET estructura_egreso_id = h_transp WHERE p_caja_id = caja;
    UPDATE public.p_caja SET estructura_egreso_id = h_alim WHERE p_caja_id = caja;
    SELECT count(*) INTO n FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND user_id=1 AND detalle->>'caja_id' = caja::text;
    v := v || jsonb_build_array(jsonb_build_object('caso','F1_mismo_padre_no_deja_rastro','ok', n = 0, 'detalle', n));

    -- 2 · padres distintos: Alimentos -> Salud. +10.000 a Alimentos, -10.000 a Salud.
    UPDATE public.p_caja SET estructura_egreso_id = h_salud WHERE p_caja_id = caja;
    SELECT COALESCE(SUM(saldo_cierre),0) INTO aj FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND user_id=1 AND estructura_egreso_id=2 AND detalle->>'caja_id'=caja::text;
    SELECT COALESCE(SUM(saldo_cierre),0) INTO aj2 FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND user_id=1 AND estructura_egreso_id=19 AND detalle->>'caja_id'=caja::text;
    v := v || jsonb_build_array(jsonb_build_object('caso','F2_dos_padres_suman_cero','ok', aj = 10000 AND aj2 = -10000,
        'detalle', jsonb_build_array(aj, aj2)));

    -- 3 · sucesivas: Salud -> Transporte. Salud queda en cero (se limpia), Transporte -10.000.
    UPDATE public.p_caja SET estructura_egreso_id = h_transp WHERE p_caja_id = caja;
    SELECT COALESCE(SUM(saldo_cierre),0) INTO aj FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND user_id=1 AND estructura_egreso_id=19 AND detalle->>'caja_id'=caja::text;
    SELECT COALESCE(SUM(saldo_cierre),0) INTO aj2 FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND user_id=1 AND estructura_egreso_id=23 AND detalle->>'caja_id'=caja::text;
    SELECT count(*) INTO n FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND user_id=1 AND detalle->>'caja_id'=caja::text;
    v := v || jsonb_build_array(jsonb_build_object('caso','F3_sucesivas_sin_residuo',
        'ok', aj = 0 AND aj2 = -10000 AND n = 2, 'detalle', jsonb_build_array(aj, aj2, n)));

    -- 4 · reversion a la categoria original: todo vuelve a cero y no queda ninguna fila.
    UPDATE public.p_caja SET estructura_egreso_id = h_alim WHERE p_caja_id = caja;
    SELECT count(*) INTO n FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND user_id=1 AND detalle->>'caja_id'=caja::text;
    v := v || jsonb_build_array(jsonb_build_object('caso','F4_reversion_sin_rastro','ok', n = 0, 'detalle', n));

    -- 5 · el cierre de octubre no se movio en todo el recorrido
    v := v || jsonb_build_array(jsonb_build_object('caso','F5_cierre_intacto',
        'ok', (SELECT (x->>'saldo_cierre')::numeric FROM jsonb_array_elements(public.fn_reporte_cierre_ciclo('2025-10-01')->'grupos') x
                WHERE (x->>'estructura_egreso_id')::bigint = 2) = 90000,
        'detalle', 'saldo 90.000 intacto'));

    -- 6 · ciclo activo: recategorizar hoy no genera ajuste historico
    INSERT INTO public.p_caja (user_id, estructura_egreso_id, fecha, tipo, moneda, valor_egreso, valor_local)
    VALUES (1, h_alim, act + 2, 'expense', 'ARS', 5000, 5000)
    RETURNING p_caja_id INTO caja2;
    UPDATE public.p_caja SET estructura_egreso_id = h_salud WHERE p_caja_id = caja2;
    SELECT count(*) INTO n FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND user_id=1 AND detalle->>'caja_id' = caja2::text;
    v := v || jsonb_build_array(jsonb_build_object('caso','F6_ciclo_activo_sin_ajuste','ok', n = 0, 'detalle', n));

    -- 7 · reintento: la misma recategorizacion dos veces no duplica
    UPDATE public.p_caja SET estructura_egreso_id = h_salud WHERE p_caja_id = caja;
    UPDATE public.p_caja SET estructura_egreso_id = h_salud WHERE p_caja_id = caja;
    SELECT COALESCE(SUM(saldo_cierre),0) INTO aj FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND user_id=1 AND estructura_egreso_id=2 AND detalle->>'caja_id'=caja::text;
    SELECT count(*) INTO n FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND user_id=1 AND detalle->>'caja_id'=caja::text;
    v := v || jsonb_build_array(jsonb_build_object('caso','F7_reintento_no_duplica',
        'ok', aj = 10000 AND n = 2, 'detalle', jsonb_build_array(aj, n)));

    -- 8 · la conciliacion sigue cerrando
    v := v || jsonb_build_array(jsonb_build_object('caso','F8_conciliacion_en_cero',
        'ok', (public.fn_conciliar_presupuesto(act)->>'diferencia')::numeric = 0,
        'detalle', public.fn_conciliar_presupuesto(act)->'diferencia'));

    RAISE EXCEPTION 'RESULTADO %', v::text;
END $blk$;
