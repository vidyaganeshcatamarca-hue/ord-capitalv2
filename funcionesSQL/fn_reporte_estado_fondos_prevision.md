CREATE OR REPLACE FUNCTION public.fn_reporte_estado_fondos_prevision()
 RETURNS TABLE(fondo_id bigint, nombre text, saldo_actual numeric, monto_meta numeric, porcentaje_progreso numeric, dias_restantes integer, estado_alerta_key text)
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
        b.billetera_id AS fondo_id,
        b.nombre,
        b.saldo_actual,
        b.monto_meta,
        CASE 
            WHEN b.monto_meta > 0 THEN ROUND((b.saldo_actual / b.monto_meta) * 100, 2)
            ELSE 0 
        END::numeric AS porcentaje_progreso,
        (b.fecha_objetivo - CURRENT_DATE)::int AS dias_restantes,
        CASE 
            WHEN b.saldo_actual >= b.monto_meta THEN 'state_fulfilled'::text
            WHEN b.fecha_objetivo < CURRENT_DATE THEN 'state_overdue'::text
            WHEN (b.fecha_objetivo - CURRENT_DATE)::int <= 60 AND (b.saldo_actual / NULLIF(b.monto_meta, 0)) < 0.5 THEN 'state_critical'::text
            ELSE 'state_in_progress'::text
        END AS estado_alerta_key
    FROM public.p_billeteras b
    WHERE b.user_id = v_user_id 
      AND b.es_fondo_prevision = TRUE
      AND b.activa = TRUE;
END;
$function$