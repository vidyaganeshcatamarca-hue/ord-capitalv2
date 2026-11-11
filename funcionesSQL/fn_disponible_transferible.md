CREATE OR REPLACE FUNCTION public.fn_disponible_transferible(p_estructura_egreso_id bigint, p_mes date)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_modo text;
    v_fecha_activacion date;
    v_mes_truncado date;
    v_mes_anterior date;
    v_dia_ancla int2;
    v_f_inicio date;
    v_f_fin date;
    v_f_inicio_ant date;
    v_f_fin_ant date;
    -- Sin fila para el ciclo anterior, el SELECT INTO deja la variable en NULL; y en
    -- Postgres `GREATEST(NULL, 0)` devuelve 0, asi que un sobre con techo quedaba en
    -- cero sin motivo. Se inicializan en cero y no se depende del COALESCE del SELECT.
    v_techo numeric := 0;
    v_techo_ant numeric := 0;
    v_gasto numeric := 0;
    v_gasto_ant numeric := 0;
    v_arrastre numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    SELECT modo_presupuesto, fecha_activacion_base_cero
      INTO v_modo, v_fecha_activacion
      FROM public.p_presupuestos_config WHERE user_id = v_user_id;

    v_mes_truncado := date_trunc('month', p_mes)::date;
    v_mes_anterior := (v_mes_truncado - INTERVAL '1 month')::date;

    SELECT dia_ancla INTO v_dia_ancla
      FROM public.p_presupuestos
     WHERE user_id = v_user_id AND mes_periodo = v_mes_truncado
     LIMIT 1;
    IF v_dia_ancla IS NULL THEN
        SELECT dia_ancla_ciclo INTO v_dia_ancla FROM public.p_presupuestos_config WHERE user_id = v_user_id;
        IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;
    END IF;

    v_f_inicio := (date_trunc('month', p_mes) + ((v_dia_ancla - 1) * INTERVAL '1 day'))::date;
    v_f_fin := (date_trunc('month', p_mes) + ((v_dia_ancla - 1) * INTERVAL '1 day') + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_f_inicio_ant := (date_trunc('month', v_mes_anterior) + ((v_dia_ancla - 1) * INTERVAL '1 day'))::date;
    v_f_fin_ant := (date_trunc('month', v_mes_anterior) + ((v_dia_ancla - 1) * INTERVAL '1 day') + INTERVAL '1 month' - INTERVAL '1 day')::date;

    SELECT COALESCE(monto_limite, 0) INTO v_techo
      FROM public.p_presupuestos
     WHERE estructura_egreso_id = p_estructura_egreso_id
       AND mes_periodo = v_mes_truncado
       AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))
     LIMIT 1;

    SELECT COALESCE(monto_limite, 0) INTO v_techo_ant
      FROM public.p_presupuestos
     WHERE estructura_egreso_id = p_estructura_egreso_id
       AND mes_periodo = v_mes_anterior
       AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))
     LIMIT 1;

    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_gasto
      FROM public.v_p_caja_reportable c
     WHERE c.estructura_egreso_id = p_estructura_egreso_id
       AND c.tipo = 'expense'
       AND c.fecha BETWEEN v_f_inicio AND v_f_fin
       AND ((c.user_id = v_user_id AND c.es_compartido = false)
            OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true));

    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_gasto_ant
      FROM public.v_p_caja_reportable c
     WHERE c.estructura_egreso_id = p_estructura_egreso_id
       AND c.tipo = 'expense'
       AND c.fecha BETWEEN v_f_inicio_ant AND v_f_fin_ant
       AND ((c.user_id = v_user_id AND c.es_compartido = false)
            OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true));

    -- Un rubro que no tenia techo el ciclo anterior no arrastra nada: si no, cada gasto
    -- sin sobre se convierte en una deuda falsa. Es la misma guarda del reporte.
    -- OJO: sin fila en el ciclo anterior, el SELECT INTO deja v_techo_ant en NULL y el
    -- CASE cae en el ELSE produciendo NULL; en Postgres `GREATEST(NULL, 0)` devuelve 0,
    -- asi que un sobre con techo quedaba en cero. Por eso el COALESCE va en la cuenta.
    v_arrastre := CASE
        WHEN COALESCE(v_techo_ant, 0) <= 0 THEN 0
        ELSE COALESCE(v_techo_ant, 0) - COALESCE(v_gasto_ant, 0)
    END;

    IF v_modo <> 'base_cero' THEN
        -- Libertad no arrastra: cada ciclo arranca en cero.
        v_arrastre := 0;
    ELSIF v_fecha_activacion IS NULL OR v_fecha_activacion > v_f_fin_ant THEN
        -- Ciclo de activacion (o sin fecha): lo anterior era del modo viejo.
        v_arrastre := 0;
    END IF;

    RETURN GREATEST(COALESCE(v_arrastre, 0) + COALESCE(v_techo, 0) - COALESCE(v_gasto, 0), 0);
END;
$function$
