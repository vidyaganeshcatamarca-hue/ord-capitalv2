-- Fix RPCs reportes tarjetas/home (bugs 42883/42803 preexistentes)
-- Diagnostico: telemetria/ (session 2026-09-16)
-- 1) comparativa: date - INTERVAL -> timestamp no castea implicito a date
-- 2) termometro: EXTRACT(DAY FROM <int>) invalido (date-date ya es int)
-- 3) alertas_home: agregado anidado SUM dentro de jsonb_agg prohibido
CREATE OR REPLACE FUNCTION public.fn_reporte_comparativa_tarjetas()
 RETURNS TABLE(tarjeta_id bigint, nombre_tarjeta text, gasto_mes_anterior numeric, gasto_mes_actual numeric, variacion_absoluta numeric, variacion_porcentual numeric, tendencia_key text, mensaje_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint;
    v_f_inicio_act date; v_f_fin_act date;
    v_f_inicio_ant date; v_f_fin_ant date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio_act, v_f_fin_act FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio_ant, v_f_fin_ant FROM public.fn_obtener_fechas_ciclo_presupuesto(v_f_inicio_act - 10);

    RETURN QUERY
    WITH gastos_mes_anterior AS (
        SELECT t.tarjeta_id, t.nombre_tarjeta, COALESCE(SUM(cd.monto_cuota), 0) as total 
        FROM p_tarjetas_credito t 
        LEFT JOIN p_cuotas_detalle cd ON t.tarjeta_id = cd.tarjeta_id AND cd.fecha_estimada_pago BETWEEN v_f_inicio_ant AND v_f_fin_ant
        WHERE t.user_id = v_user_id GROUP BY t.tarjeta_id, t.nombre_tarjeta
    ),
    gastos_mes_actual AS (
        SELECT t.tarjeta_id, COALESCE(SUM(cd.monto_cuota), 0) as total 
        FROM p_tarjetas_credito t 
        LEFT JOIN p_cuotas_detalle cd ON t.tarjeta_id = cd.tarjeta_id AND cd.fecha_estimada_pago BETWEEN v_f_inicio_act AND v_f_fin_act
        WHERE t.user_id = v_user_id GROUP BY t.tarjeta_id
    )
    SELECT gma.tarjeta_id, gma.nombre_tarjeta, gma.total, COALESCE(gmac.total, 0), (COALESCE(gmac.total, 0) - gma.total),
        CASE WHEN gma.total = 0 THEN 0 ELSE ROUND(((COALESCE(gmac.total, 0) - gma.total) / gma.total) * 100, 2) END,
        CASE WHEN COALESCE(gmac.total, 0) > gma.total THEN 'trend_up'::text WHEN COALESCE(gmac.total, 0) < gma.total THEN 'trend_down'::text ELSE 'trend_stable'::text END,
        CASE WHEN COALESCE(gmac.total, 0) > gma.total * 1.2 THEN 'alert_card_overuse'::text WHEN COALESCE(gmac.total, 0) < gma.total * 0.8 THEN 'alert_card_savings'::text ELSE 'alert_card_stable'::text END
    FROM gastos_mes_anterior gma LEFT JOIN gastos_mes_actual gmac ON gma.tarjeta_id = gmac.tarjeta_id WHERE gma.total > 0 OR COALESCE(gmac.total, 0) > 0 ORDER BY ABS(COALESCE(gmac.total, 0) - gma.total) DESC;
END;
$function$

