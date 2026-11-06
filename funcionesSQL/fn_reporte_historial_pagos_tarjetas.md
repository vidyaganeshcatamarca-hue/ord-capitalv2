CREATE OR REPLACE FUNCTION public.fn_reporte_historial_pagos_tarjetas()
 RETURNS TABLE(pago_id bigint, fecha date, tarjeta_nombre text, monto_pagado numeric, billetera_origen text, cuotas_liquidadas integer, observaciones text, moneda text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT
        c.p_caja_id,
        c.fecha,
        t.nombre_tarjeta,
        c.valor_egreso,
        b.nombre,
        COALESCE((
            SELECT COUNT(*)
            FROM p_cuotas_detalle cd
            WHERE cd.p_caja_id = c.p_caja_id AND cd.pagado = true
        ), 0)::integer,
        c.observaciones,
        COALESCE(c.moneda, 'ARS')::text AS moneda
    FROM p_caja c
    INNER JOIN p_tarjetas_credito t ON c.tarjeta_id = t.tarjeta_id
    LEFT JOIN p_billeteras b ON c.billetera_origen_id = b.billetera_id
    WHERE c.user_id = v_user_id
      AND c.tipo = 'pago_tarjeta'
      AND c.tarjeta_id IS NOT NULL
    ORDER BY c.fecha DESC
    LIMIT 50;
END;
$function$
