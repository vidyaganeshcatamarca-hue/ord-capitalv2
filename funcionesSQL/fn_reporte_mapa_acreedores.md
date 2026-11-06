CREATE OR REPLACE FUNCTION public.fn_reporte_mapa_acreedores()
 RETURNS TABLE(acreedor_id bigint, nombre_acreedor text, tipo_deuda text, monto_total numeric, porcentaje_total numeric, color text, icono text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    WITH deuda_total AS (
        SELECT SUM(monto_total) AS total
        FROM (
            SELECT SUM(monto_cuota * (12 - posicion_cuota)) AS monto_total
            FROM p_compromisos_tarjeta
            WHERE user_id = v_user_id AND pagado = false
            UNION ALL
            SELECT SUM(monto_prestamo) AS monto_total
            FROM p_prestamos
            WHERE user_id = v_user_id
        ) AS total_deuda
    )
    SELECT 
        COALESCE(t.tarjeta_id, p.prestamo_id) AS acreedor_id,
        COALESCE(t.nombre_tarjeta, p.nombre_prestamo) AS nombre_acreedor,
        COALESCE(t.tipo_deuda, p.tipo_deuda) AS tipo_deuda,
        COALESCE(t.monto_total, p.monto_total) AS monto_total,
        (COALESCE(t.monto_total, p.monto_total) / NULLIF(dt.total, 0)) * 100 AS porcentaje_total,
        COALESCE(t.color, p.color) AS color,
        CASE 
            WHEN t.tarjeta_id IS NOT NULL THEN '💳'
            WHEN p.prestamo_id IS NOT NULL THEN '🏛️'
            ELSE '🤝'
        END AS icono
    FROM deuda_total dt
    LEFT JOIN (
        SELECT t.tarjeta_id, t.nombre_tarjeta, 'tarjeta' AS tipo_deuda, SUM(monto_cuota * (12 - posicion_cuota)) AS monto_total, t.color
        FROM p_tarjetas_credito t
        INNER JOIN p_compromisos_tarjeta c ON t.tarjeta_id = c.tarjeta_id
        WHERE t.user_id = v_user_id AND c.pagado = false
        GROUP BY t.tarjeta_id, t.nombre_tarjeta, t.color
    ) t ON true
    LEFT JOIN (
        SELECT p.prestamo_id, p.nombre_prestamo, p.tipo_deuda, SUM(p.monto_prestamo) AS monto_total, p.color
        FROM p_prestamos p
        WHERE p.user_id = v_user_id
        GROUP BY p.prestamo_id, p.nombre_prestamo, p.tipo_deuda, p.color
    ) p ON true
    WHERE dt.total > 0
    ORDER BY monto_total DESC;
END;
$function$