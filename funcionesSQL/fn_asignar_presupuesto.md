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
    v_monto_previo numeric := 0;
    v_mes_truncado date := date_trunc('month', p_mes_periodo);
    v_dia_ancla int2;
    v_presupuesto_id bigint;
    v_es_padre boolean := false;
    v_padre_id bigint;
    v_hijos_con_plata int := 0;
    v_plata_padre numeric := 0;
    v_fila record;
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

    SELECT COALESCE(monto_limite, 0) INTO v_monto_previo
    FROM public.p_presupuestos
    WHERE estructura_egreso_id = p_estructura_egreso_id AND mes_periodo = v_mes_truncado AND user_id = v_user_id;

    -- ─── S19/S23: la plata es excluyente. Sólo aplica a la PLATA, nunca al techo. ───
    IF p_monto_asignado > 0 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.p_estructuras_egresos h WHERE h.padre_id = p_estructura_egreso_id
        ) INTO v_es_padre;

        IF v_es_padre THEN
            SELECT count(*) INTO v_hijos_con_plata
              FROM public.p_presupuestos pr
             WHERE pr.mes_periodo = v_mes_truncado AND pr.user_id = v_user_id
               AND pr.monto_limite > 0
               AND pr.estructura_egreso_id IN (
                   SELECT h.estructura_id FROM public.p_estructuras_egresos h
                    WHERE h.padre_id = p_estructura_egreso_id);

            IF v_hijos_con_plata > 0 THEN
                IF NOT p_mover_plata THEN
                    RAISE EXCEPTION '{"key": "budget_needs_confirm_move_to_parent", "params": {"hijos": %}}', v_hijos_con_plata;
                END IF;

                FOR v_fila IN
                    SELECT pr.presupuesto_id, pr.estructura_egreso_id, pr.monto_limite
                      FROM public.p_presupuestos pr
                     WHERE pr.mes_periodo = v_mes_truncado AND pr.user_id = v_user_id
                       AND pr.monto_limite > 0
                       AND pr.estructura_egreso_id IN (
                           SELECT h.estructura_id FROM public.p_estructuras_egresos h
                            WHERE h.padre_id = p_estructura_egreso_id)
                LOOP
                    UPDATE public.p_presupuestos
                       SET monto_limite = 0
                     WHERE presupuesto_id = v_fila.presupuesto_id;

                    INSERT INTO public.p_presupuestos_historial
                        (presupuesto_id, estructura_egreso_id, user_id, hogar_id, mes_periodo,
                         dia_ancla, monto_limite, motivo, modo_origen, modo_destino)
                    VALUES (v_fila.presupuesto_id, v_fila.estructura_egreso_id, v_user_id, v_hogar_id,
                            v_mes_truncado, v_dia_ancla, 0, 'movido_al_padre', v_modo_presupuesto, v_modo_presupuesto);
                END LOOP;
            END IF;
        ELSE
            SELECT e.padre_id INTO v_padre_id
              FROM public.p_estructuras_egresos e WHERE e.estructura_id = p_estructura_egreso_id;

            IF v_padre_id IS NOT NULL THEN
                SELECT COALESCE(monto_limite, 0) INTO v_plata_padre
                  FROM public.p_presupuestos
                 WHERE mes_periodo = v_mes_truncado AND user_id = v_user_id
                   AND estructura_egreso_id = v_padre_id;

                IF v_plata_padre > 0 THEN
                    IF NOT p_mover_plata THEN
                        RAISE EXCEPTION '{"key": "budget_needs_confirm_move_from_parent", "params": {"plata": %}}', v_plata_padre;
                    END IF;

                    UPDATE public.p_presupuestos
                       SET monto_limite = GREATEST(v_plata_padre - p_monto_asignado, 0)
                     WHERE mes_periodo = v_mes_truncado AND user_id = v_user_id
                       AND estructura_egreso_id = v_padre_id;

                    INSERT INTO public.p_presupuestos_historial
                        (presupuesto_id, estructura_egreso_id, user_id, hogar_id, mes_periodo,
                         dia_ancla, monto_limite, motivo, modo_origen, modo_destino)
                    SELECT p2.presupuesto_id, v_padre_id, v_user_id, v_hogar_id, v_mes_truncado,
                           v_dia_ancla, GREATEST(v_plata_padre - p_monto_asignado, 0),
                           'movido_al_hijo', v_modo_presupuesto, v_modo_presupuesto
                      FROM public.p_presupuestos p2
                     WHERE p2.mes_periodo = v_mes_truncado AND p2.user_id = v_user_id
                       AND p2.estructura_egreso_id = v_padre_id;
                END IF;
            END IF;
        END IF;
    END IF;

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

    IF v_monto_previo IS DISTINCT FROM p_monto_asignado THEN
        INSERT INTO public.p_presupuestos_historial
            (presupuesto_id, estructura_egreso_id, user_id, hogar_id, mes_periodo,
             dia_ancla, monto_limite, motivo, modo_origen, modo_destino)
        VALUES (v_presupuesto_id, p_estructura_egreso_id, v_user_id, v_hogar_id, v_mes_truncado,
                v_dia_ancla, p_monto_asignado, p_motivo, v_modo_presupuesto, v_modo_presupuesto);
    END IF;
END;
$function$
