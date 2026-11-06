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

    SELECT 
        (
            COALESCE((SELECT monto_limite FROM p_presupuestos p2 WHERE p2.estructura_egreso_id = p_origen_id AND p2.mes_periodo = v_mes_anterior AND (p2.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p2.hogar_id = v_hogar_id))), 0) -
            COALESCE((SELECT SUM(valor_egreso) FROM p_caja c WHERE c.estructura_egreso_id = p_origen_id AND c.tipo = 'expense' AND c.fecha BETWEEN v_f_inicio_ant AND v_f_fin_ant AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0)
        ) + COALESCE(p.monto_limite, 0) - COALESCE((
            SELECT SUM(valor_egreso) FROM p_caja c
            WHERE c.estructura_egreso_id = p_origen_id
              AND c.tipo = 'expense'
              AND c.fecha BETWEEN v_f_inicio AND v_f_fin
              AND ((c.user_id = v_user_id AND c.es_compartido = false) 
                   OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
        ), 0) INTO v_disponible_origen
    FROM p_estructuras_egresos e
    LEFT JOIN p_presupuestos p ON e.estructura_id = p.estructura_egreso_id 
        AND p.mes_periodo = v_mes_truncado 
        AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
    WHERE e.estructura_id = p_origen_id 
      AND (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id));

    IF v_disponible_origen IS NULL OR v_disponible_origen < p_monto THEN
        RAISE EXCEPTION '{"key": "error_insufficient_funds_in_envelope", "params": {}}';
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