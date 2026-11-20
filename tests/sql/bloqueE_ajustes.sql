-- Bloque E · corregir un gasto de un ciclo cerrado deja un ajuste en el ciclo activo.
-- Todo en una transaccion que revierte.
DO $blk$
DECLARE
    v jsonb := '[]'::jsonb;
    h1 bigint;
    caja bigint;
    antes numeric;
    despues numeric;
    act date := date_trunc('month', CURRENT_DATE)::date;
    n int;
    aj numeric;
    u1 text;
BEGIN
    SELECT json_build_object('sub', u.auth_id)::text INTO u1 FROM public.usuarios u WHERE u.user_id = 1;
    PERFORM set_config('request.jwt.claims', u1, true);
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 1, fecha_activacion_base_cero = NULL WHERE user_id = 1;
    SELECT e.estructura_id INTO h1 FROM public.p_estructuras_egresos e WHERE e.padre_id = 2 ORDER BY e.estructura_id LIMIT 1;

    -- Un ciclo cerrado con un gasto en una subcategoria.
    INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla)
    VALUES (1, 2, '2025-06-01', 100000, 1);
    INSERT INTO public.p_caja (user_id, estructura_egreso_id, fecha, tipo, moneda, valor_egreso, valor_local)
    VALUES (1, h1, '2025-06-10', 'expense', 'ARS', 35000, 35000)
    RETURNING p_caja_id INTO caja;
    PERFORM public.fn_cerrar_ciclo_presupuesto('2025-06-01');

    SELECT public.fn_disponible_transferible(2, act) INTO antes;

    -- Correccion a la baja: el grupo deberia haber tenido 10.000 mas.
    UPDATE public.p_caja SET valor_egreso = 25000, valor_local = 25000 WHERE p_caja_id = caja;

    SELECT count(*), COALESCE(SUM(saldo_cierre), 0) INTO n, aj
      FROM public.p_presupuestos_cierre
     WHERE tipo = 'ajuste' AND mes_periodo = act AND estructura_egreso_id = 2 AND user_id = 1;
    v := v || jsonb_build_array(jsonb_build_object('caso','E1_ajuste_a_favor','ok', n = 1 AND aj = 10000,
        'detalle', jsonb_build_array(n, aj)));

    SELECT public.fn_disponible_transferible(2, act) INTO despues;
    v := v || jsonb_build_array(jsonb_build_object('caso','E2_la_bolsa_sube_lo_mismo','ok', despues - antes = 10000,
        'detalle', jsonb_build_array(antes, despues)));

    -- El ajuste cae en el padre, nunca en la subcategoria.
    v := v || jsonb_build_array(jsonb_build_object('caso','E3_el_ajuste_es_del_padre',
        'ok', (SELECT count(*) FROM public.p_presupuestos_cierre
                WHERE tipo='ajuste' AND mes_periodo=act AND user_id=1 AND estructura_egreso_id = h1) = 0,
        'detalle', 'sin fila en la hija'));

    -- El cierre del mes corregido no se movio.
    v := v || jsonb_build_array(jsonb_build_object('caso','E4_cierre_congelado_intacto',
        'ok', (SELECT (x->>'saldo_cierre')::numeric FROM jsonb_array_elements(public.fn_reporte_cierre_ciclo('2025-06-01')->'grupos') x
                WHERE (x->>'estructura_egreso_id')::bigint = 2) = 65000,
        'detalle', 'saldo 65.000 intacto'));

    -- Repetir el mismo valor no genera otro ajuste.
    UPDATE public.p_caja SET valor_local = 25000 WHERE p_caja_id = caja;
    SELECT count(*) INTO n FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND estructura_egreso_id=2 AND user_id=1;
    v := v || jsonb_build_array(jsonb_build_object('caso','E5_no_duplica','ok', n = 1, 'detalle', n));

    -- Corregir de nuevo hacia arriba: el ajuste acumulado es la diferencia real (5.000).
    UPDATE public.p_caja SET valor_egreso = 30000, valor_local = 30000 WHERE p_caja_id = caja;
    SELECT COALESCE(SUM(saldo_cierre),0) INTO aj FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND estructura_egreso_id=2 AND user_id=1;
    v := v || jsonb_build_array(jsonb_build_object('caso','E6_acumula_la_diferencia_real','ok', aj = 5000, 'detalle', aj));

    -- La conciliacion sigue cerrando.
    v := v || jsonb_build_array(jsonb_build_object('caso','E7_conciliacion_sigue_en_cero',
        'ok', (public.fn_conciliar_presupuesto(act)->>'diferencia')::numeric = 0,
        'detalle', public.fn_conciliar_presupuesto(act)->'diferencia'));

    -- Si el gasto sale del ciclo cerrado (se borra), el ajuste devuelve todo lo gastado.
    DELETE FROM public.p_caja WHERE p_caja_id = caja;
    SELECT COALESCE(SUM(saldo_cierre),0) INTO aj FROM public.p_presupuestos_cierre
     WHERE tipo='ajuste' AND mes_periodo=act AND estructura_egreso_id=2 AND user_id=1;
    v := v || jsonb_build_array(jsonb_build_object('caso','E8_borrar_devuelve_todo','ok', aj = 35000, 'detalle', aj));


    -- E9/E10 · Modo Libertad: la correccion existe pero no arrastra dinero al ciclo siguiente.
    PERFORM set_config('request.jwt.claims',
      (SELECT json_build_object('sub', u.auth_id)::text FROM public.usuarios u WHERE u.user_id = 198), true);
    UPDATE public.p_presupuestos_config SET dia_ancla_ciclo = 1 WHERE user_id = 198;
    INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla)
    VALUES (198, 4265, '2025-07-01', 70000, 1);
    INSERT INTO public.p_caja (user_id, estructura_egreso_id, fecha, tipo, moneda, valor_egreso, valor_local)
    VALUES (198, 4265, '2025-07-10', 'expense', 'ARS', 20000, 20000)
    RETURNING p_caja_id INTO caja;
    PERFORM public.fn_cerrar_ciclo_presupuesto('2025-07-01');
    -- El importe almacenado no es necesariamente el que escribimos: hay disparadores de moneda.
    -- Se toma el valor real antes y despues, y el ajuste tiene que ser exactamente esa diferencia.
    SELECT COALESCE(valor_local, valor_egreso) INTO antes FROM public.p_caja WHERE p_caja_id = caja;
    UPDATE public.p_caja SET valor_egreso = 12000, valor_local = 12000 WHERE p_caja_id = caja;
    SELECT COALESCE(valor_local, valor_egreso) INTO despues FROM public.p_caja WHERE p_caja_id = caja;

    v := v || jsonb_build_array(jsonb_build_object('caso','E9_libertad_registra_el_ajuste',
        'ok', (SELECT COALESCE(SUM(saldo_cierre),0) FROM public.p_presupuestos_cierre
                WHERE tipo='ajuste' AND user_id=198 AND estructura_egreso_id=4265
                  AND mes_periodo = date_trunc('month',CURRENT_DATE)::date) = (antes - despues),
        'detalle', (SELECT COALESCE(SUM(saldo_cierre),0) FROM public.p_presupuestos_cierre
                WHERE tipo='ajuste' AND user_id=198 AND estructura_egreso_id=4265
                  AND mes_periodo = date_trunc('month',CURRENT_DATE)::date)));

    v := v || jsonb_build_array(jsonb_build_object('caso','E10_libertad_no_arrastra',
        'ok', public.fn_disponible_transferible(4265, '2025-08-01') = 0
              AND public.fn_disponible_transferible(4265, '2025-09-01') = 0,
        'detalle', jsonb_build_array(public.fn_disponible_transferible(4265, '2025-08-01'),
                                     public.fn_disponible_transferible(4265, '2025-09-01'))));

    RAISE EXCEPTION 'RESULTADO %', v::text;
END $blk$;
