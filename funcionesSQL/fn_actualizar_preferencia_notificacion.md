CREATE OR REPLACE FUNCTION public.fn_actualizar_preferencia_notificacion(p_push_enabled boolean DEFAULT NULL::boolean, p_push_time time without time zone DEFAULT NULL::time without time zone, p_reminder_daily_expenses boolean DEFAULT NULL::boolean, p_reminder_daily_expenses_time time without time zone DEFAULT NULL::time without time zone, p_cat_vencimientos boolean DEFAULT NULL::boolean, p_cat_recurrentes boolean DEFAULT NULL::boolean, p_cat_liquidez boolean DEFAULT NULL::boolean, p_cat_presupuesto boolean DEFAULT NULL::boolean, p_cat_cuarentena boolean DEFAULT NULL::boolean, p_cat_deuda boolean DEFAULT NULL::boolean, p_cat_ahorro boolean DEFAULT NULL::boolean, p_cat_inversiones boolean DEFAULT NULL::boolean, p_cat_hogar boolean DEFAULT NULL::boolean, p_cat_score boolean DEFAULT NULL::boolean, p_cat_resumen_semanal boolean DEFAULT NULL::boolean, p_cat_resumen_mensual boolean DEFAULT NULL::boolean, p_balance_desequilibrado_threshold numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE public.p_notificaciones_config SET
        push_enabled = COALESCE(p_push_enabled, push_enabled),
        push_time = COALESCE(p_push_time, push_time),
        reminder_daily_expenses = COALESCE(p_reminder_daily_expenses, reminder_daily_expenses),
        reminder_daily_expenses_time = COALESCE(p_reminder_daily_expenses_time, reminder_daily_expenses_time),
        cat_vencimientos = COALESCE(p_cat_vencimientos, cat_vencimientos),
        cat_recurrentes = COALESCE(p_cat_recurrentes, cat_recurrentes),
        cat_liquidez = COALESCE(p_cat_liquidez, cat_liquidez),
        cat_presupuesto = COALESCE(p_cat_presupuesto, cat_presupuesto),
        cat_cuarentena = COALESCE(p_cat_cuarentena, cat_cuarentena),
        cat_deuda = COALESCE(p_cat_deuda, cat_deuda),
        cat_ahorro = COALESCE(p_cat_ahorro, cat_ahorro),
        cat_inversiones = COALESCE(p_cat_inversiones, cat_inversiones),
        cat_hogar = COALESCE(p_cat_hogar, cat_hogar),
        cat_score = COALESCE(p_cat_score, cat_score),
        cat_resumen_semanal = COALESCE(p_cat_resumen_semanal, cat_resumen_semanal),
        cat_resumen_mensual = COALESCE(p_cat_resumen_mensual, cat_resumen_mensual),
        balance_desequilibrado_threshold = COALESCE(p_balance_desequilibrado_threshold, balance_desequilibrado_threshold),
        actualizado_at = now()
    WHERE user_id = v_user_id;

    IF NOT FOUND THEN
        -- Si no existe, crear con defaults
        INSERT INTO public.p_notificaciones_config (
            user_id, push_enabled, push_time, reminder_daily_expenses, reminder_daily_expenses_time,
            cat_vencimientos, cat_recurrentes, cat_liquidez, cat_presupuesto, cat_cuarentena,
            cat_deuda, cat_ahorro, cat_inversiones, cat_hogar, cat_score,
            cat_resumen_semanal, cat_resumen_mensual, balance_desequilibrado_threshold
        ) VALUES (
            v_user_id,
            COALESCE(p_push_enabled, true),
            COALESCE(p_push_time, '09:00:00'::time),
            COALESCE(p_reminder_daily_expenses, true),
            COALESCE(p_reminder_daily_expenses_time, '20:00:00'::time),
            COALESCE(p_cat_vencimientos, true),
            COALESCE(p_cat_recurrentes, true),
            COALESCE(p_cat_liquidez, true),
            COALESCE(p_cat_presupuesto, true),
            COALESCE(p_cat_cuarentena, true),
            COALESCE(p_cat_deuda, true),
            COALESCE(p_cat_ahorro, true),
            COALESCE(p_cat_inversiones, true),
            COALESCE(p_cat_hogar, true),
            COALESCE(p_cat_score, true),
            COALESCE(p_cat_resumen_semanal, true),
            COALESCE(p_cat_resumen_mensual, true),
            COALESCE(p_balance_desequilibrado_threshold, 100000)
        );
    END IF;
END;
$function$