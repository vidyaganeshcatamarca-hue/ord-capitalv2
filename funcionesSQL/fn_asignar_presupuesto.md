CREATE OR REPLACE FUNCTION public.fn_asignar_presupuesto(p_estructura_egreso_id bigint, p_monto_asignado numeric, p_mes_periodo date, p_motivo text DEFAULT 'manual'::text, p_mover_plata boolean DEFAULT false)
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
    v_deficit_grupo numeric := 0;
    v_monto_previo numeric := 0;
    v_mes_truncado date := date_trunc('month', p_mes_periodo);
    v_dia_ancla int2;
    v_presupuesto_id bigint;
    v_padre_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    IF public.fn_ciclo_esta_cerrado(p_mes_periodo) THEN
        RAISE EXCEPTION '{"key": "error_budget_cycle_closed", "params": {}}';
    END IF;

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

    -- ─── ETAPA 1.3: la plata vive en el padre, nunca en la subcategoría ───
    -- Se permite poner 0 en una subcategoría (asi se limpia una fila vieja);
    -- se rechaza cualquier monto positivo.
    IF p_monto_asignado > 0 THEN
        SELECT e.padre_id INTO v_padre_id
          FROM public.p_estructuras_egresos e
         WHERE e.estructura_id = p_estructura_egreso_id;

        IF v_padre_id IS NOT NULL THEN
            RAISE EXCEPTION '{"key": "error_budget_child_holds_no_money", "params": {}}';
        END IF;
    END IF;

    SELECT COALESCE(monto_limite, 0) INTO v_monto_previo
    FROM public.p_presupuestos
    WHERE estructura_egreso_id = p_estructura_egreso_id AND mes_periodo = v_mes_truncado AND user_id = v_user_id;

    IF v_modo_presupuesto = 'base_cero' THEN
        v_saldo_disponible := public.fn_obtener_saldo_a_asignar(p_mes_periodo);

        -- Bloque G (decision B del duenio): cubrir el deficit de un grupo consume plata libre
        -- sin dejar reserva, asi que asignar solo lo libre no reserva nada. Se permite asignar
        -- lo libre MAS el deficit del grupo: asi la reserva sube exactamente lo libre y el saldo
        -- libre queda en cero. Sin deficit, el techo sigue siendo lo libre.
        IF COALESCE(p_monto_asignado, 0) > 0 THEN
            v_deficit_grupo := GREATEST(-COALESCE(public.fn_disponible_transferible(
                                    p_estructura_egreso_id, v_mes_truncado), 0), 0);
        END IF;

        IF p_monto_asignado > (v_saldo_disponible + v_monto_previo + v_deficit_grupo) THEN
            RAISE EXCEPTION '{"key": "error_budget_insufficient_base_zero", "params": {}}';
        END IF;
    END IF;

    INSERT INTO public.p_presupuestos (estructura_egreso_id, user_id, hogar_id, monto_limite, mes_periodo, dia_ancla)
    VALUES (p_estructura_egreso_id, v_user_id, v_hogar_id, p_monto_asignado, v_mes_truncado, v_dia_ancla)
    ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0))
    DO UPDATE SET monto_limite = EXCLUDED.monto_limite, dia_ancla = EXCLUDED.dia_ancla
    RETURNING presupuesto_id INTO v_presupuesto_id;

    IF v_monto_previo IS DISTINCT FROM p_monto_asignado THEN
        INSERT INTO public.p_presupuestos_historial
            (presupuesto_id, estructura_egreso_id, user_id, hogar_id, mes_periodo,
             dia_ancla, monto_limite, motivo, modo_origen, modo_destino)
        VALUES (v_presupuesto_id, p_estructura_egreso_id, v_user_id, v_hogar_id, v_mes_truncado,
                v_dia_ancla, p_monto_asignado, p_motivo, v_modo_presupuesto, v_modo_presupuesto);
    END IF;
END;
$function$
