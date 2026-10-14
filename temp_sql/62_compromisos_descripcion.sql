CREATE OR REPLACE FUNCTION public.fn_reporte_compromisos_tarjeta(p_tarjeta_id bigint, p_fecha_pago date DEFAULT CURRENT_DATE)
 RETURNS TABLE(cuota_id bigint, fecha_estimada_pago date, descripcion text, monto_cuota numeric, moneda text, posicion_cuota integer, total_cuotas integer, pagado boolean, caja_id bigint, es_ciclo_actual boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_mes_actual date := date_trunc('month', p_fecha_pago);
    v_fin_ciclo_actual date;
    v_vencimiento_ciclo_actual date;
    v_min_fecha date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(dia_cierre, 20), COALESCE(dia_vencimiento, 10)
      INTO v_dia_cierre, v_dia_vencimiento
      FROM p_tarjetas_credito
      WHERE tarjeta_id = p_tarjeta_id;

    IF v_dia_vencimiento > v_dia_cierre THEN
        IF EXTRACT(DAY FROM p_fecha_pago) <= v_dia_cierre THEN
            v_fin_ciclo_actual := v_mes_actual + ((v_dia_cierre - 1) * INTERVAL '1 day');
        ELSE
            v_fin_ciclo_actual := (v_mes_actual + INTERVAL '1 month') + ((v_dia_cierre - 1) * INTERVAL '1 day');
        END IF;
    ELSE
        IF EXTRACT(DAY FROM p_fecha_pago) <= v_dia_cierre THEN
            v_fin_ciclo_actual := (v_mes_actual - INTERVAL '1 month') + ((v_dia_cierre - 1) * INTERVAL '1 day');
        ELSE
            v_fin_ciclo_actual := v_mes_actual + ((v_dia_cierre - 1) * INTERVAL '1 day');
        END IF;
    END IF;

    IF v_dia_vencimiento <= v_dia_cierre THEN
        v_vencimiento_ciclo_actual := (date_trunc('month', v_fin_ciclo_actual) + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
    ELSE
        v_vencimiento_ciclo_actual := date_trunc('month', v_fin_ciclo_actual) + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
    END IF;

    SELECT MIN(p_cuotas_detalle.fecha_estimada_pago) INTO v_min_fecha
      FROM p_cuotas_detalle
      WHERE p_cuotas_detalle.tarjeta_id = p_tarjeta_id AND p_cuotas_detalle.pagado = false;

    IF v_min_fecha IS NOT NULL AND v_min_fecha > v_vencimiento_ciclo_actual THEN
        v_vencimiento_ciclo_actual := v_min_fecha;
    END IF;

    RETURN QUERY
    SELECT
        c.cuota_id,
        c.fecha_estimada_pago,
        -- La compra por voz solo guarda categoria (estructura) y a veces
        -- detalle; el nombre de categoria es data del movimiento.
        COALESCE(cx.nombre_cuenta_historico, cx.detalle, eg.nombre_cuenta)::text AS descripcion,
        c.monto_cuota,
        COALESCE(c.moneda, 'ARS')::text AS moneda,
        c.numero_cuota AS posicion_cuota,
        cx.cuotas_totales AS total_cuotas,
        c.pagado,
        c.p_caja_id AS caja_id,
        (NOT c.pagado
         AND date_trunc('month', c.fecha_estimada_pago) <= date_trunc('month', v_vencimiento_ciclo_actual)
        ) AS es_ciclo_actual
    FROM p_cuotas_detalle c
    LEFT JOIN p_caja cx ON c.p_caja_id = cx.p_caja_id
    LEFT JOIN p_estructuras_egresos eg ON eg.estructura_id = cx.estructura_egreso_id
    WHERE c.user_id = v_user_id
      AND c.tarjeta_id = p_tarjeta_id
    ORDER BY c.pagado ASC, c.fecha_estimada_pago ASC;
END;
$function$
