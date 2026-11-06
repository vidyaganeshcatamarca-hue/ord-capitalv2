CREATE OR REPLACE FUNCTION public.fn_configurar_onboarding_final(p_dia_ancla_ciclo smallint DEFAULT 1, p_modo_presupuesto text DEFAULT 'anticipado'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF p_dia_ancla_ciclo < 1 OR p_dia_ancla_ciclo > 31 THEN
        RAISE EXCEPTION '{"key": "error_budget_anchor_day_invalid", "params": {}}';
    END IF;

    IF p_modo_presupuesto NOT IN ('base_cero', 'anticipado') THEN
        RAISE EXCEPTION '{"key": "error_budget_mode_invalid", "params": {}}';
    END IF;

    INSERT INTO p_presupuestos_config (user_id, dia_ancla_ciclo, modo_presupuesto, porcentaje_necesidades, porcentaje_deseos, porcentaje_ahorro, porcentaje_diezmo)
    VALUES (v_user_id, p_dia_ancla_ciclo, p_modo_presupuesto, 50.00, 30.00, 20.00, 0.00)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        dia_ancla_ciclo = EXCLUDED.dia_ancla_ciclo,
        modo_presupuesto = EXCLUDED.modo_presupuesto;

    -- Actualizar el dia de ancla en los presupuestos del mes actual y futuros
    UPDATE public.p_presupuestos
    SET dia_ancla = p_dia_ancla_ciclo
    WHERE user_id = v_user_id AND mes_periodo >= date_trunc('month', CURRENT_DATE);
END;
$function$