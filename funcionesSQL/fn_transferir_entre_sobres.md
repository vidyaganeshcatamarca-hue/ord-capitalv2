CREATE OR REPLACE FUNCTION public.fn_transferir_entre_sobres(p_origen_id bigint, p_destino_id bigint, p_monto numeric, p_mes_periodo date DEFAULT date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_disponible_origen numeric;
    v_mes_truncado date := date_trunc('month', p_mes_periodo);
    v_f_inicio date;
    v_f_fin date;
    v_dia_ancla int2;
    v_mes_anterior date := v_mes_truncado - INTERVAL '1 month';
    v_f_inicio_ant date;
    v_f_fin_ant date;
    v_padre_destino bigint;
    v_techo_destino numeric;
    v_repartido_destino numeric;
    v_actual_destino numeric;
    v_actual_origen numeric;
    v_repartido_origen numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    IF p_monto <= 0 THEN
        RAISE EXCEPTION '{"key": "error_amount_must_be_positive", "params": {}}';
    END IF;

    IF p_origen_id = p_destino_id THEN
        RAISE EXCEPTION '{"key": "error_cannot_transfer_to_same_envelope", "params": {}}';
    END IF;

    SELECT dia_ancla INTO v_dia_ancla
    FROM public.p_presupuestos
    WHERE user_id = v_user_id AND mes_periodo = v_mes_truncado
    LIMIT 1;

    IF v_dia_ancla IS NULL THEN
        SELECT dia_ancla_ciclo INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;
        IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;
    END IF;

    v_f_inicio := date_trunc('month', p_mes_periodo) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin := (v_f_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    v_f_inicio_ant := date_trunc('month', v_mes_anterior) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin_ant := (v_f_inicio_ant + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- Ronda 10: una sola formula, la del helper. Antes estaba copiada aca adentro y sin
    -- mirar el modo, asi que en libertad sumaba arrastre. El helper respeta el modo y no
    -- descuenta a los hijos.
    v_disponible_origen := public.fn_disponible_transferible(p_origen_id, p_mes_periodo);

    IF v_disponible_origen IS NULL OR v_disponible_origen < p_monto THEN
        RAISE EXCEPTION '{"key": "error_insufficient_funds_in_envelope", "params": {}}';
    END IF;

    -- S2/S7/S15: el techo del padre manda tambien en las transferencias, y en los dos
    -- extremos. Tiene que ir antes de escribir: la funcion mueve plata con un UPDATE y un
    -- INSERT sueltos, asi que un rechazo despues del UPDATE dejaria media transferencia.
    --
    -- Destino: si es hijo de un padre con presupuesto mayor a cero, el valor resultante no
    -- puede pasarse de lo libre del techo (excluyendo al destino de la suma de hermanos).
    SELECT padre_id INTO v_padre_destino
      FROM public.p_estructuras_egresos
     WHERE estructura_id = p_destino_id;

    IF v_padre_destino IS NOT NULL THEN
        SELECT monto_limite INTO v_techo_destino
          FROM public.p_presupuestos
         WHERE estructura_egreso_id = v_padre_destino
           AND mes_periodo = v_mes_truncado
           AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));

        IF COALESCE(v_techo_destino, 0) > 0 THEN
            SELECT COALESCE(monto_limite, 0) INTO v_actual_destino
              FROM public.p_presupuestos
             WHERE estructura_egreso_id = p_destino_id
               AND mes_periodo = v_mes_truncado
               AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));

            SELECT COALESCE(SUM(pr.monto_limite), 0) INTO v_repartido_destino
              FROM public.p_presupuestos pr
              JOIN public.p_estructuras_egresos e ON e.estructura_id = pr.estructura_egreso_id
             WHERE e.padre_id = v_padre_destino
               AND pr.mes_periodo = v_mes_truncado
               AND (pr.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND pr.hogar_id = v_hogar_id))
               AND pr.estructura_egreso_id <> p_destino_id;

            IF (COALESCE(v_actual_destino, 0) + p_monto) > (v_techo_destino - v_repartido_destino) THEN
                RAISE EXCEPTION '%', json_build_object(
                    'key', 'error_budget_child_over_parent',
                    'params', json_build_object(
                        'disponible', GREATEST(v_techo_destino - v_repartido_destino, 0),
                        'intento', COALESCE(v_actual_destino, 0) + p_monto,
                        'techo', v_techo_destino,
                        'repartido', v_repartido_destino
                    )
                )::text;
            END IF;
        END IF;
    END IF;

    -- Origen: si es padre con hijos, sacarle plata no puede dejarlo por debajo de lo que
    -- ya tiene repartido en ellos.
    IF EXISTS (SELECT 1 FROM public.p_estructuras_egresos h WHERE h.padre_id = p_origen_id) THEN
        SELECT COALESCE(monto_limite, 0) INTO v_actual_origen
          FROM public.p_presupuestos
         WHERE estructura_egreso_id = p_origen_id
           AND mes_periodo = v_mes_truncado
           AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));

        SELECT COALESCE(SUM(pr.monto_limite), 0) INTO v_repartido_origen
          FROM public.p_presupuestos pr
          JOIN public.p_estructuras_egresos e ON e.estructura_id = pr.estructura_egreso_id
         WHERE e.padre_id = p_origen_id
           AND pr.mes_periodo = v_mes_truncado
           AND (pr.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND pr.hogar_id = v_hogar_id));

        IF (COALESCE(v_actual_origen, 0) - p_monto) < v_repartido_origen THEN
            RAISE EXCEPTION '%', json_build_object(
                'key', 'error_budget_parent_below_children',
                'params', json_build_object(
                    'repartido', v_repartido_origen,
                    'intento', COALESCE(v_actual_origen, 0) - p_monto,
                    'recortar', v_repartido_origen - (COALESCE(v_actual_origen, 0) - p_monto)
                )
            )::text;
        END IF;
    END IF;

    UPDATE p_presupuestos
    SET monto_limite = monto_limite - p_monto
    WHERE estructura_egreso_id = p_origen_id 
      AND mes_periodo = v_mes_truncado
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));

    INSERT INTO p_presupuestos (
        user_id, hogar_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla
    )
    SELECT v_user_id, v_hogar_id, p_destino_id, v_mes_truncado, p_monto, v_dia_ancla
    WHERE EXISTS (SELECT 1 FROM p_estructuras_egresos WHERE estructura_id = p_destino_id)
    ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0)) 
    DO UPDATE SET monto_limite = p_presupuestos.monto_limite + EXCLUDED.monto_limite;
END;
$function$
