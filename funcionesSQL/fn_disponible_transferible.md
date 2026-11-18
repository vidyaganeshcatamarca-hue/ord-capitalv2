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
    v_plata numeric := 0;
    v_plata_ant numeric := 0;
    v_gasto numeric := 0;
    v_gasto_ant numeric := 0;
    v_arrastre numeric := 0;
    v_es_hija boolean := false;
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

    -- Una subcategoría no maneja plata: no transfiere. Su padre es el dueño de la bolsa.
    SELECT (e.padre_id IS NOT NULL) INTO v_es_hija
      FROM public.p_estructuras_egresos e WHERE e.estructura_id = p_estructura_egreso_id;
    IF COALESCE(v_es_hija, false) THEN RETURN 0; END IF;

    -- Plata asignada a esta categoría en el ciclo.
    SELECT COALESCE(monto_limite, 0) INTO v_plata
      FROM public.p_presupuestos
     WHERE estructura_egreso_id = p_estructura_egreso_id
       AND mes_periodo = v_mes_truncado
       AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))
     LIMIT 1;

    -- Gasto del grupo en el ciclo: la categoría y sus subcategorías.
    SELECT COALESCE(SUM(COALESCE(c.valor_local, c.valor_egreso)), 0) INTO v_gasto
      FROM public.v_p_caja_reportable c
     WHERE c.tipo = 'expense'
       AND c.fecha BETWEEN v_f_inicio AND v_f_fin
       AND (c.estructura_egreso_id = p_estructura_egreso_id
            OR c.estructura_egreso_id IN (SELECT h.estructura_id FROM public.p_estructuras_egresos h WHERE h.padre_id = p_estructura_egreso_id))
       AND ((c.user_id = v_user_id AND c.es_compartido = false)
            OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true));

    -- Arrastre: solo en base cero, y fuera del ciclo de activación. Es el resultado del
    -- ciclo anterior de TODO el grupo, con el signo que tenga.
    IF v_modo = 'base_cero' AND (v_fecha_activacion IS NULL OR v_fecha_activacion <= v_f_fin_ant) THEN
        SELECT COALESCE((SELECT p.monto_limite FROM public.p_presupuestos p
                          WHERE p.estructura_egreso_id = p_estructura_egreso_id
                            AND p.mes_periodo = v_mes_anterior
                            AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
                          LIMIT 1), 0)
             + COALESCE((SELECT SUM(ph.monto_limite)
                           FROM public.p_presupuestos ph
                           JOIN public.p_estructuras_egresos eh ON eh.estructura_id = ph.estructura_egreso_id
                          WHERE eh.padre_id = p_estructura_egreso_id
                            AND ph.mes_periodo = v_mes_anterior
                            AND (ph.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND ph.hogar_id = v_hogar_id))), 0)
          INTO v_plata_ant;

        SELECT COALESCE(SUM(COALESCE(c.valor_local, c.valor_egreso)), 0) INTO v_gasto_ant
          FROM public.v_p_caja_reportable c
         WHERE c.tipo = 'expense'
           AND c.fecha BETWEEN v_f_inicio_ant AND v_f_fin_ant
           AND (c.estructura_egreso_id = p_estructura_egreso_id
                OR c.estructura_egreso_id IN (SELECT h.estructura_id FROM public.p_estructuras_egresos h WHERE h.padre_id = p_estructura_egreso_id))
           AND ((c.user_id = v_user_id AND c.es_compartido = false)
                OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true));

        -- Sin plata el ciclo anterior no hay arrastre: si no, cada gasto sin sobre se
        -- convierte en una deuda que nadie decidió.
        IF COALESCE(v_plata_ant, 0) > 0 THEN
            v_arrastre := COALESCE(v_plata_ant, 0) - COALESCE(v_gasto_ant, 0);
        END IF;
    END IF;

    -- La bolsa, con su signo. Un déficit vuelve negativo y el que llama decide.
    RETURN COALESCE(v_arrastre, 0) + COALESCE(v_plata, 0) - COALESCE(v_gasto, 0);
END;
$function$
