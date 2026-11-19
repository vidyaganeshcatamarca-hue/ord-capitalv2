CREATE OR REPLACE FUNCTION public.fn_asignar_techo(p_estructura_egreso_id bigint, p_techo numeric, p_mes_periodo date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_padre_id bigint;
    v_dia_ancla int2;
    v_mes_truncado date := date_trunc('month', p_mes_periodo)::date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    IF public.fn_ciclo_esta_cerrado(p_mes_periodo) THEN
        RAISE EXCEPTION '{"key": "error_budget_cycle_closed", "params": {}}';
    END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    SELECT e.padre_id INTO v_padre_id
      FROM public.p_estructuras_egresos e
     WHERE e.estructura_id = p_estructura_egreso_id
       AND (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id));

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_category_parent_not_found", "params": {}}';
    END IF;

    IF v_padre_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_ceiling_only_for_subcategory", "params": {}}';
    END IF;

    IF p_techo IS NOT NULL AND p_techo <= 0 THEN
        RAISE EXCEPTION '{"key": "error_ceiling_must_be_positive", "params": {}}';
    END IF;

    SELECT dia_ancla INTO v_dia_ancla
      FROM public.p_presupuestos
     WHERE user_id = v_user_id AND mes_periodo = v_mes_truncado
     LIMIT 1;
    IF v_dia_ancla IS NULL THEN
        SELECT dia_ancla_ciclo INTO v_dia_ancla FROM public.p_presupuestos_config WHERE user_id = v_user_id;
        IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;
    END IF;

    -- El tope no toca la plata: si la fila existe, solo cambia monto_techo.
    INSERT INTO public.p_presupuestos (estructura_egreso_id, user_id, hogar_id, monto_limite, monto_techo, mes_periodo, dia_ancla)
    VALUES (p_estructura_egreso_id, v_user_id, v_hogar_id, 0, p_techo, v_mes_truncado, v_dia_ancla)
    ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0))
    DO UPDATE SET monto_techo = EXCLUDED.monto_techo;

    -- Rastro: queda registrado el tope nuevo junto con la plata que ya tenia la fila.
    INSERT INTO public.p_presupuestos_historial
        (presupuesto_id, estructura_egreso_id, user_id, hogar_id, mes_periodo, dia_ancla,
         monto_limite, monto_techo, motivo, modo_origen, modo_destino)
    SELECT pr.presupuesto_id, p_estructura_egreso_id, v_user_id, v_hogar_id, v_mes_truncado, v_dia_ancla,
           pr.monto_limite, p_techo, 'techo', NULL, NULL
      FROM public.p_presupuestos pr
     WHERE pr.estructura_egreso_id = p_estructura_egreso_id
       AND pr.mes_periodo = v_mes_truncado
       AND pr.user_id = v_user_id;
END;
$function$
