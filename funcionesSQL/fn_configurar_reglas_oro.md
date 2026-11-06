CREATE OR REPLACE FUNCTION public.fn_configurar_reglas_oro(p_pct_necesidades numeric, p_pct_deseos numeric, p_pct_ahorro numeric, p_pct_diezmo numeric, p_dia_ancla_ciclo smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_suma numeric;
    v_hogar_id int8;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    v_suma := p_pct_necesidades + p_pct_deseos + p_pct_ahorro + p_pct_diezmo;
    IF v_suma != 100.00 THEN
        RAISE EXCEPTION '{"key": "error_budget_golden_rules_sum", "params": {"sum": v_suma}}';
    END IF;

    IF p_dia_ancla_ciclo < 1 OR p_dia_ancla_ciclo > 31 THEN
        RAISE EXCEPTION '{"key": "error_budget_anchor_day_invalid", "params": {}}';
    END IF;

    INSERT INTO p_presupuestos_config (user_id, porcentaje_necesidades, porcentaje_deseos, porcentaje_ahorro, porcentaje_diezmo, dia_ancla_ciclo)
    VALUES (v_user_id, p_pct_necesidades, p_pct_deseos, p_pct_ahorro, p_pct_diezmo, p_dia_ancla_ciclo)
    ON CONFLICT (user_id)
    DO UPDATE SET
        porcentaje_necesidades = EXCLUDED.porcentaje_necesidades,
        porcentaje_deseos = EXCLUDED.porcentaje_deseos,
        porcentaje_ahorro = EXCLUDED.porcentaje_ahorro,
        porcentaje_diezmo = EXCLUDED.porcentaje_diezmo,
        dia_ancla_ciclo = EXCLUDED.dia_ancla_ciclo;

    -- Tithe rubro: created by the system on saves with pct_diezmo > 0, shown
    -- like any user-created rubro. Existence is checked against ANY tithe
    -- rubro of the user (own or system) to avoid duplicates.
    IF p_pct_diezmo > 0 THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.p_estructuras_egresos
            WHERE user_id = v_user_id
              AND tipo_cupo = 'tithe'
              AND padre_id IS NULL
        ) THEN
            INSERT INTO public.p_estructuras_egresos (
                nombre_cuenta, descripcion, user_id, tipo_cupo, icono, color, hogar_id, padre_id
            )
            VALUES (
                'cat_tithe', '', v_user_id, 'tithe', '🙏', '#7c3aed', v_hogar_id, NULL
            );
        END IF;
    END IF;

    -- Actualizar el dia de ancla en los presupuestos del mes actual y futuros
    UPDATE public.p_presupuestos
    SET dia_ancla = p_dia_ancla_ciclo
    WHERE user_id = v_user_id AND mes_periodo >= date_trunc('month', CURRENT_DATE);
END;

$function$;
