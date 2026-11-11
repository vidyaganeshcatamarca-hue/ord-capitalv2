CREATE OR REPLACE FUNCTION public.fn_asignar_presupuesto(p_estructura_egreso_id bigint, p_monto_asignado numeric, p_mes_periodo date, p_motivo text DEFAULT 'manual')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_modo_presupuesto text;
    v_saldo_disponible numeric;
    v_monto_previo numeric := 0;
    v_mes_truncado date := date_trunc('month', p_mes_periodo);
    v_dia_ancla int2;
    v_presupuesto_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    SELECT modo_presupuesto INTO v_modo_presupuesto FROM public.p_presupuestos_config WHERE user_id = v_user_id;

    SELECT dia_ancla INTO v_dia_ancla
    FROM public.p_presupuestos
    WHERE user_id = v_user_id AND mes_periodo = v_mes_truncado
    LIMIT 1;

    IF v_dia_ancla IS NULL THEN
        SELECT dia_ancla_ciclo INTO v_dia_ancla FROM public.p_presupuestos_config WHERE user_id = v_user_id;
        IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;
    END IF;

    -- El monto previo se lee en TODOS los modos: en libertad tambien hay que auditar,
    -- y antes solo se leia dentro del IF de base cero.
    SELECT COALESCE(monto_limite, 0) INTO v_monto_previo
    FROM public.p_presupuestos
    WHERE estructura_egreso_id = p_estructura_egreso_id AND mes_periodo = v_mes_truncado AND user_id = v_user_id;

    IF v_modo_presupuesto = 'base_cero' THEN
        v_saldo_disponible := public.fn_obtener_saldo_a_asignar(p_mes_periodo);

        IF p_monto_asignado > (v_saldo_disponible + v_monto_previo) THEN
            RAISE EXCEPTION '{"key": "error_budget_insufficient_base_zero", "params": {}}';
        END IF;
    END IF;

    INSERT INTO public.p_presupuestos (estructura_egreso_id, user_id, hogar_id, monto_limite, mes_periodo, dia_ancla)
    VALUES (p_estructura_egreso_id, v_user_id, v_hogar_id, p_monto_asignado, v_mes_truncado, v_dia_ancla)
    ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0))
    DO UPDATE SET monto_limite = EXCLUDED.monto_limite, dia_ancla = EXCLUDED.dia_ancla
    RETURNING presupuesto_id INTO v_presupuesto_id;

    -- Historial: solo cuando el valor cambia de verdad. Se guarda el valor NUEVO;
    -- la secuencia completa se reconstruye leyendo hacia atras. Ojo: esta tabla tambien
    -- la escribe el cambio de modo (motivo 'cambio_a_base_cero', con modo_origen y
    -- modo_destino distintos). Las filas de asignacion usan motivo manual/promedio_6m.
    IF v_monto_previo IS DISTINCT FROM p_monto_asignado THEN
        INSERT INTO public.p_presupuestos_historial
            (presupuesto_id, estructura_egreso_id, user_id, hogar_id, mes_periodo,
             dia_ancla, monto_limite, motivo, modo_origen, modo_destino)
        VALUES (v_presupuesto_id, p_estructura_egreso_id, v_user_id, v_hogar_id, v_mes_truncado,
                v_dia_ancla, p_monto_asignado, p_motivo, v_modo_presupuesto, v_modo_presupuesto);
    END IF;
END;
$function$;
