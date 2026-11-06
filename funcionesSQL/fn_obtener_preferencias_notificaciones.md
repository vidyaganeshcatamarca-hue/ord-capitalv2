CREATE OR REPLACE FUNCTION public.fn_obtener_preferencias_notificaciones()
 RETURNS TABLE(push_enabled boolean, push_time time without time zone, reminder_daily_expenses boolean, reminder_daily_expenses_time time without time zone, cat_vencimientos boolean, cat_recurrentes boolean, cat_liquidez boolean, cat_presupuesto boolean, cat_cuarentena boolean, cat_deuda boolean, cat_ahorro boolean, cat_inversiones boolean, cat_hogar boolean, cat_score boolean, cat_resumen_semanal boolean, cat_resumen_mensual boolean, balance_desequilibrado_threshold numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT 
        n.push_enabled,
        n.push_time,
        n.reminder_daily_expenses,
        n.reminder_daily_expenses_time,
        n.cat_vencimientos,
        n.cat_recurrentes,
        n.cat_liquidez,
        n.cat_presupuesto,
        n.cat_cuarentena,
        n.cat_deuda,
        n.cat_ahorro,
        n.cat_inversiones,
        n.cat_hogar,
        n.cat_score,
        n.cat_resumen_semanal,
        n.cat_resumen_mensual,
        n.balance_desequilibrado_threshold
    FROM public.p_notificaciones_config n
    WHERE n.user_id = v_user_id;
END;
$function$