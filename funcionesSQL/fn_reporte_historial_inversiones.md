CREATE OR REPLACE FUNCTION public.fn_reporte_historial_inversiones()
 RETURNS TABLE(inversion_id bigint, nombre_activo text, moneda text, monto_original numeric, monto_liquidado numeric, ganancia_perdida numeric, rendimiento_pct numeric, fecha_inicio date, fecha_liquidacion date, dias_mantenida integer)
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
        i.inversion_id,
        i.nombre_activo,
        COALESCE(i.moneda, 'ARS'),
        i.monto_invertido_original,
        i.monto_liquidado,
        (i.monto_liquidado - i.monto_invertido_original)::numeric,
        CASE
            WHEN i.monto_invertido_original > 0 THEN
                ROUND(((i.monto_liquidado - i.monto_invertido_original) / i.monto_invertido_original) * 100, 2)
            ELSE 0
        END::numeric,
        i.fecha_inicio,
        i.fecha_liquidacion,
        (i.fecha_liquidacion - i.fecha_inicio)::integer
    FROM p_inversiones i
    WHERE i.user_id = v_user_id AND i.estado = 'finalizada'
    ORDER BY i.fecha_liquidacion DESC;
END;
$function$
