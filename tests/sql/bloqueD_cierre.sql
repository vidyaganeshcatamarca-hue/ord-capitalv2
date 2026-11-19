-- Bloque D · aceptacion del cierre de ciclo. Todo en una transaccion que revierte.
DO $blk$
DECLARE
    v jsonb := '[]'::jsonb;
    r jsonb;
    r2 jsonb;
    n int;
    antes numeric;
    despues numeric;
    fila jsonb;
    u1 text;
    u198 text;
BEGIN
    SELECT json_build_object('sub', u.auth_id)::text INTO u1 FROM public.usuarios u WHERE u.user_id = 1;
    SELECT json_build_object('sub', u.auth_id)::text INTO u198 FROM public.usuarios u WHERE u.user_id = 198;

    -- Preparacion: dos meses viejos, sin datos, para el usuario 1 (base cero, ancla 1).
    PERFORM set_config('request.jwt.claims', u1, true);
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 1 WHERE user_id = 1;
    -- Sin fecha de activacion el arrastre de base cero aplica en cualquier ciclo.
    UPDATE public.p_presupuestos_config SET fecha_activacion_base_cero = NULL WHERE user_id = 1;

    -- A) padre con saldo positivo: plata 100.000, gasto 40.000 -> +60.000
    INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla)
    VALUES (1, 2, '2025-01-01', 100000, 1)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.p_caja (user_id, estructura_egreso_id, fecha, tipo, moneda, valor_egreso, valor_local)
    VALUES (1, 2, '2025-01-10', 'expense', 'ARS', 40000, 40000);

    -- B) padre con deficit: plata 10.000, gasto 30.000 -> -20.000
    INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla)
    VALUES (1, 19, '2025-01-01', 10000, 1)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.p_caja (user_id, estructura_egreso_id, fecha, tipo, moneda, valor_egreso, valor_local)
    VALUES (1, 19, '2025-01-12', 'expense', 'ARS', 30000, 30000);

    -- K) las billeteras antes del cierre
    SELECT COALESCE(SUM(saldo_actual), 0) INTO antes FROM public.p_billeteras WHERE user_id = 1;

    r := public.fn_cerrar_ciclo_presupuesto('2025-01-01');
    v := v || jsonb_build_array(jsonb_build_object('caso','A_cierra_positivo','ok', (r->>'cerrado')::boolean AND (r->>'grupos')::int >= 2, 'detalle', r));

    SELECT to_jsonb(c) INTO fila FROM public.p_presupuestos_cierre c
     WHERE c.tipo='cierre' AND c.mes_periodo='2025-01-01' AND c.estructura_egreso_id=2 AND c.user_id=1;
    v := v || jsonb_build_array(jsonb_build_object('caso','A_saldo_positivo_60k','ok', (fila->>'saldo_cierre')::numeric = 60000, 'detalle', fila->>'saldo_cierre'));

    SELECT to_jsonb(c) INTO fila FROM public.p_presupuestos_cierre c
     WHERE c.tipo='cierre' AND c.mes_periodo='2025-01-01' AND c.estructura_egreso_id=19 AND c.user_id=1;
    v := v || jsonb_build_array(jsonb_build_object('caso','B_saldo_negativo_20k','ok', (fila->>'saldo_cierre')::numeric = -20000, 'detalle', fila->>'saldo_cierre'));

    -- K) nadie movio una billetera
    SELECT COALESCE(SUM(saldo_actual), 0) INTO despues FROM public.p_billeteras WHERE user_id = 1;
    v := v || jsonb_build_array(jsonb_build_object('caso','K_billeteras_quietas','ok', antes = despues, 'detalle', jsonb_build_array(antes, despues)));

    -- F) el arrastre del ciclo siguiente usa el cierre: +60.000 y -20.000 por separado
    v := v || jsonb_build_array(jsonb_build_object('caso','F_arrastre_usa_cierre_positivo',
        'ok', public.fn_disponible_transferible(2, '2025-02-01') = 60000,
        'detalle', public.fn_disponible_transferible(2, '2025-02-01')));
    v := v || jsonb_build_array(jsonb_build_object('caso','F_arrastre_conserva_deficit',
        'ok', public.fn_disponible_transferible(19, '2025-02-01') = -20000,
        'detalle', public.fn_disponible_transferible(19, '2025-02-01')));

    -- F2) corregir un gasto del ciclo cerrado no mueve el arrastre ya congelado
    INSERT INTO public.p_caja (user_id, estructura_egreso_id, fecha, tipo, moneda, valor_egreso, valor_local)
    VALUES (1, 2, '2025-01-15', 'expense', 'ARS', 5000, 5000);
    v := v || jsonb_build_array(jsonb_build_object('caso','F_correccion_no_mueve_arrastre',
        'ok', public.fn_disponible_transferible(2, '2025-02-01') = 60000,
        'detalle', public.fn_disponible_transferible(2, '2025-02-01')));
    SELECT (x->'grupos'->0->>'saldo_cierre')::numeric INTO antes
      FROM public.fn_reporte_cierre_ciclo('2025-01-01') x, LATERAL (SELECT x->'grupos' AS grupos) y LIMIT 1;
    v := v || jsonb_build_array(jsonb_build_object('caso','F_lectura_congelada',
        'ok', (public.fn_reporte_cierre_ciclo('2025-01-01')->'cerrado')::boolean,
        'detalle', public.fn_reporte_cierre_ciclo('2025-01-01')->'ciclo'));

    -- D) cerrar dos veces no duplica
    SELECT count(*) INTO n FROM public.p_presupuestos_cierre WHERE mes_periodo='2025-01-01' AND user_id=1;
    r2 := public.fn_cerrar_ciclo_presupuesto('2025-01-01');
    v := v || jsonb_build_array(jsonb_build_object('caso','D_idempotente',
        'ok', (r2->>'motivo') = 'ya_cerrado' AND (SELECT count(*) FROM public.p_presupuestos_cierre WHERE mes_periodo='2025-01-01' AND user_id=1) = n,
        'detalle', r2));

    -- C) un ciclo sin asignaciones cierra igual
    r := public.fn_cerrar_ciclo_presupuesto('2024-06-01');
    v := v || jsonb_build_array(jsonb_build_object('caso','C_ciclo_vacio',
        'ok', (r->>'cerrado')::boolean AND (r->>'grupos')::int = 0, 'detalle', r));

    -- G/H) con el ciclo cerrado, el servidor rechaza asignar, transferir y poner techo
    BEGIN
        PERFORM public.fn_asignar_presupuesto(2, 5000, '2025-01-01', 'PRUEBA', false);
        v := v || jsonb_build_array(jsonb_build_object('caso','G_asignar_rechazado','ok', false, 'detalle','no rechazo'));
    EXCEPTION WHEN OTHERS THEN
        v := v || jsonb_build_array(jsonb_build_object('caso','G_asignar_rechazado',
            'ok', SQLERRM LIKE '%error_budget_cycle_closed%', 'detalle', SQLERRM));
    END;
    BEGIN
        PERFORM public.fn_transferir_entre_sobres(2, 23, 1000, '2025-01-01', 'prueba-d');
        v := v || jsonb_build_array(jsonb_build_object('caso','G_transferir_rechazado','ok', false, 'detalle','no rechazo'));
    EXCEPTION WHEN OTHERS THEN
        v := v || jsonb_build_array(jsonb_build_object('caso','G_transferir_rechazado',
            'ok', SQLERRM LIKE '%error_budget_cycle_closed%', 'detalle', SQLERRM));
    END;
    BEGIN
        PERFORM public.fn_asignar_techo(2, 5000, '2025-01-01');
        v := v || jsonb_build_array(jsonb_build_object('caso','H_techo_rechazado','ok', false, 'detalle','no rechazo'));
    EXCEPTION WHEN OTHERS THEN
        v := v || jsonb_build_array(jsonb_build_object('caso','H_techo_rechazado',
            'ok', SQLERRM LIKE '%error_budget_cycle_closed%', 'detalle', SQLERRM));
    END;

    -- E) dia ancla 21: el ciclo va del 21 al 20, no del 1 al 30
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 21 WHERE user_id = 1;
    r := public.fn_cerrar_ciclo_presupuesto('2025-03-01');
    v := v || jsonb_build_array(jsonb_build_object('caso','E_ancla_21',
        'ok', (r->>'inicio') = '2025-02-21' AND (r->>'fin') = '2025-03-20', 'detalle', r));
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 1 WHERE user_id = 1;
    -- Sin fecha de activacion el arrastre de base cero aplica en cualquier ciclo.
    UPDATE public.p_presupuestos_config SET fecha_activacion_base_cero = NULL WHERE user_id = 1;

    -- N) en libertad no hay arrastre de dinero, pero el ciclo queda registrado
    PERFORM set_config('request.jwt.claims', u198, true);
    -- Modo Libertad se guarda como 'anticipado': planifica, no reserva dinero.
    INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla)
    SELECT 198, 4265, '2025-01-01', 70000, 1
    WHERE NOT EXISTS (SELECT 1 FROM public.p_presupuestos WHERE user_id=198 AND estructura_egreso_id=4265 AND mes_periodo='2025-01-01');
    r := public.fn_cerrar_ciclo_presupuesto('2025-01-01');
    v := v || jsonb_build_array(jsonb_build_object('caso','I_libertad_cierra',
        'ok', (r->>'cerrado')::boolean, 'detalle', r));
    v := v || jsonb_build_array(jsonb_build_object('caso','I_libertad_sin_arrastre',
        'ok', public.fn_disponible_transferible(4265, '2025-02-01') = 0,
        'detalle', public.fn_disponible_transferible(4265, '2025-02-01')));

    -- N) los cierres de uno no se ven desde el otro
    v := v || jsonb_build_array(jsonb_build_object('caso','N_aislamiento',
        'ok', (SELECT count(*) FROM jsonb_array_elements(public.fn_reporte_cierre_ciclo('2025-01-01')->'grupos') g
                WHERE (g->>'estructura_egreso_id')::bigint = 2) = 0,
        'detalle', public.fn_reporte_cierre_ciclo('2025-01-01')->'grupos'));

    -- L) la conciliacion del Bloque B sigue cerrando
    PERFORM set_config('request.jwt.claims', u1, true);
    v := v || jsonb_build_array(jsonb_build_object('caso','L_conciliacion',
        'ok', (public.fn_conciliar_presupuesto(date_trunc('month', CURRENT_DATE)::date)->>'diferencia')::numeric = 0
              AND (public.fn_conciliar_presupuesto(date_trunc('month', CURRENT_DATE)::date)->>'grupos_con_gasto_descuadrado') = '[]',
        'detalle', public.fn_conciliar_presupuesto(date_trunc('month', CURRENT_DATE)::date)->'diferencia'));

    RAISE EXCEPTION 'RESULTADO %', v::text;
END $blk$;
