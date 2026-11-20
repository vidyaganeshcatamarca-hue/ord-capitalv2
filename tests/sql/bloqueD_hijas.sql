-- Bloque D (1 A y 2 A) · el desglose de las subcategorias en el cierre.
-- Todo en una transaccion que revierte.
DO $blk$
DECLARE
    v jsonb := '[]'::jsonb;
    r jsonb;
    rep jsonb;
    g jsonb;
    hijas jsonb;
    h1 bigint; h2 bigint;
    n int;
    u1 text; u198 text;
BEGIN
    SELECT json_build_object('sub', u.auth_id)::text INTO u1 FROM public.usuarios u WHERE u.user_id = 1;
    SELECT json_build_object('sub', u.auth_id)::text INTO u198 FROM public.usuarios u WHERE u.user_id = 198;
    SELECT e.estructura_id INTO h1 FROM public.p_estructuras_egresos e WHERE e.padre_id = 2 ORDER BY e.estructura_id LIMIT 1;
    SELECT e.estructura_id INTO h2 FROM public.p_estructuras_egresos e WHERE e.padre_id = 2 ORDER BY e.estructura_id DESC LIMIT 1;

    PERFORM set_config('request.jwt.claims', u1, true);
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 1, fecha_activacion_base_cero = NULL WHERE user_id = 1;

    -- Padre con plata 100.000, dos hijos con gasto y un gasto directo del padre.
    INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, monto_techo, dia_ancla)
    VALUES (1, 2, '2025-05-01', 100000, NULL, 1);
    INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, monto_techo, dia_ancla)
    VALUES (1, h1, '2025-05-01', 0, 40000, 1);
    INSERT INTO public.p_caja (user_id, estructura_egreso_id, fecha, tipo, moneda, valor_egreso, valor_local) VALUES
        (1, h1, '2025-05-05', 'expense', 'ARS', 35000, 35000),
        (1, h2, '2025-05-06', 'expense', 'ARS', 15000, 15000),
        (1, 2,  '2025-05-07', 'expense', 'ARS', 5000, 5000);

    r := public.fn_cerrar_ciclo_presupuesto('2025-05-01');
    rep := public.fn_reporte_cierre_ciclo('2025-05-01');
    g := (SELECT x FROM jsonb_array_elements(rep->'grupos') x WHERE (x->>'estructura_egreso_id')::bigint = 2);
    hijas := g->'hijos';

    v := v || jsonb_build_array(jsonb_build_object('caso','H1_cierra_con_desglose',
        'ok', (r->>'cerrado')::boolean AND (r->>'hijas')::int >= 2 AND (g->>'desglose')::boolean, 'detalle', r));

    v := v || jsonb_build_array(jsonb_build_object('caso','H2_gasto_del_padre_cierra',
        'ok', (g->>'monto_gastado')::numeric = 55000 AND (g->>'saldo_cierre')::numeric = 45000
              AND ((g->>'monto_limite')::numeric + ((g->'detalle')->>'arrastre')::numeric - (g->>'monto_gastado')::numeric) = (g->>'saldo_cierre')::numeric,
        'detalle', g));

    v := v || jsonb_build_array(jsonb_build_object('caso','H2_suma_de_hijos_mas_padre',
        'ok', (SELECT COALESCE(SUM((x->>'gasto')::numeric),0) FROM jsonb_array_elements(hijas) x) = 50000
              AND (g->>'monto_gastado')::numeric - (SELECT COALESCE(SUM((x->>'gasto')::numeric),0) FROM jsonb_array_elements(hijas) x) = 5000,
        'detalle', jsonb_build_object('hijos', (SELECT COALESCE(SUM((x->>'gasto')::numeric),0) FROM jsonb_array_elements(hijas) x), 'padre', (g->>'monto_gastado')::numeric)));

    v := v || jsonb_build_array(jsonb_build_object('caso','H3_hijo_sin_movimientos_en_cero',
        'ok', (SELECT (x->>'gasto')::numeric FROM jsonb_array_elements(hijas) x WHERE (x->>'estructura_egreso_id')::bigint = h2) = 15000
              AND (SELECT count(*) FROM jsonb_array_elements(hijas) x WHERE (x->>'gasto')::numeric = 35000) = 1,
        'detalle', hijas));

    v := v || jsonb_build_array(jsonb_build_object('caso','H4_hijo_sin_techo_no_es_cero',
        'ok', (SELECT (x->>'tiene_techo')::boolean FROM jsonb_array_elements(hijas) x WHERE (x->>'estructura_egreso_id')::bigint = h2) = false
              AND (SELECT (x->>'tiene_techo')::boolean FROM jsonb_array_elements(hijas) x WHERE (x->>'estructura_egreso_id')::bigint = h1) = true,
        'detalle', hijas));

    -- Cambiar el techo en el ciclo siguiente no puede mover el techo congelado.
    UPDATE public.p_presupuestos SET monto_techo = 60000 WHERE user_id = 1 AND estructura_egreso_id = h1 AND mes_periodo = '2025-05-01';
    v := v || jsonb_build_array(jsonb_build_object('caso','H5_techo_congelado_no_cambia',
        'ok', (SELECT (y->>'techo')::numeric
                 FROM jsonb_array_elements(public.fn_reporte_cierre_ciclo('2025-05-01')->'grupos') x,
                      jsonb_array_elements(x->'hijos') y
                WHERE (x->>'estructura_egreso_id')::bigint = 2
                  AND (y->>'estructura_egreso_id')::bigint = h1) = 40000,
        'detalle', 'techo congelado'));

    -- Corregir un gasto del ciclo cerrado no mueve el gasto congelado del hijo.
    INSERT INTO public.p_caja (user_id, estructura_egreso_id, fecha, tipo, moneda, valor_egreso, valor_local)
    VALUES (1, h1, '2025-05-20', 'expense', 'ARS', 7000, 7000);
    v := v || jsonb_build_array(jsonb_build_object('caso','H6_gasto_congelado_no_cambia',
        'ok', (SELECT (y->>'gasto')::numeric
                 FROM jsonb_array_elements(public.fn_reporte_cierre_ciclo('2025-05-01')->'grupos') x,
                      jsonb_array_elements(x->'hijos') y
                WHERE (x->>'estructura_egreso_id')::bigint = 2
                  AND (y->>'estructura_egreso_id')::bigint = h1) = 35000,
        'detalle', 'gasto congelado'));

    -- Repetir el cierre no duplica filas de hijos.
    SELECT count(*) INTO n FROM public.p_presupuestos_cierre WHERE user_id = 1 AND padre_id IS NOT NULL;
    r := public.fn_cerrar_ciclo_presupuesto('2025-05-01');
    v := v || jsonb_build_array(jsonb_build_object('caso','H7_no_duplica_hijos',
        'ok', (r->>'motivo') = 'ya_cerrado'
              AND (SELECT count(*) FROM public.p_presupuestos_cierre WHERE user_id = 1 AND padre_id IS NOT NULL) = n,
        'detalle', r));

    -- Un hijo no recibe plata ni saldo propios dentro del cierre.
    v := v || jsonb_build_array(jsonb_build_object('caso','H8_hijos_sin_plata',
        'ok', (SELECT count(*) FROM public.p_presupuestos_cierre
                WHERE user_id = 1 AND padre_id IS NOT NULL AND (monto_limite <> 0 OR saldo_cierre <> 0)) = 0,
        'detalle', 'plata y saldo en cero'));

    -- Un cierre viejo, sin desglose guardado, no se rellena con ceros inventados.
    INSERT INTO public.p_presupuestos_cierre (user_id, hogar_id, mes_periodo, estructura_egreso_id, tipo,
                                              monto_limite, monto_gastado, saldo_cierre, detalle)
    VALUES (1, NULL, '2024-07-01', 2, 'cierre', 1000, 200, 800, jsonb_build_object('modo','base_cero')),
           (1, NULL, '2024-07-01', 0, 'ciclo', 0, 0, 0, jsonb_build_object('modo','base_cero','grupos',1));
    rep := public.fn_reporte_cierre_ciclo('2024-07-01');
    v := v || jsonb_build_array(jsonb_build_object('caso','H10_cierre_viejo_sin_ceros',
        'ok', (rep->>'cerrado')::boolean
              AND (SELECT (x->>'desglose')::boolean FROM jsonb_array_elements(rep->'grupos') x) = false
              AND jsonb_array_length((SELECT (x->'hijos') FROM jsonb_array_elements(rep->'grupos') x)) = 0,
        'detalle', rep->'grupos'));

    -- Modo Libertad: el cierre tambien guarda el desglose y se puede leer.
    PERFORM set_config('request.jwt.claims', u198, true);
    r := public.fn_cerrar_ciclo_presupuesto('2025-05-01');
    rep := public.fn_reporte_cierre_ciclo('2025-05-01');
    v := v || jsonb_build_array(jsonb_build_object('caso','H9_libertad_lee_desglose',
        'ok', (r->>'cerrado')::boolean AND (rep->'ciclo'->'ciclo'->>'modo') = 'anticipado',
        'detalle', jsonb_build_object('cierre', r, 'modo', rep->'ciclo'->'ciclo'->>'modo')));

    RAISE EXCEPTION 'RESULTADO %', v::text;
END $blk$;
