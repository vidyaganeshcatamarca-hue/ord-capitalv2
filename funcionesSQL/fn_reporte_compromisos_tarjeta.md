CREATE OR REPLACE FUNCTION public.fn_reporte_compromisos_tarjeta(p_tarjeta_id bigint, p_fecha_pago date DEFAULT CURRENT_DATE)
 RETURNS TABLE(cuota_id bigint, fecha_estimada_pago date, descripcion text, detalle_movimiento text, monto_cuota numeric, moneda text, posicion_cuota integer, total_cuotas integer, pagado boolean, caja_id bigint, es_ciclo_actual boolean, carga_id bigint)
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

    -- S10: el vencimiento del resumen se calcula igual que en
    -- fn_reporte_vencimientos_tarjetas, que es la fuente que alimentan el banner y
    -- el modal de pago. Antes se saltaba al ciclo siguiente apenas pasaba el dia de
    -- cierre, asi que las cuotas del resumen en curso quedaban marcadas como
    -- "no actuales" y el panel de adelantar cuotas aparecia vacio.
    IF EXTRACT(DAY FROM p_fecha_pago) <= v_dia_vencimiento THEN
        v_vencimiento_ciclo_actual := v_mes_actual + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
    ELSE
        v_vencimiento_ciclo_actual := (v_mes_actual + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
    END IF;

    RETURN QUERY
    SELECT
        c.cuota_id,
        c.fecha_estimada_pago,
        -- Contrato: descripcion = la CATEGORIA del movimiento (cuenta
        -- historica si la hay, si no la estructura); detalle = el texto libre
        -- de la compra (el UI lo muestra entre parentesis, en chico).
        COALESCE(cx.nombre_cuenta_historico, eg.nombre_cuenta, eg2.nombre_cuenta, c.descripcion)::text AS descripcion,
        CASE WHEN c.p_caja_id IS NULL AND c.estructura_egreso_id IS NOT NULL THEN c.descripcion ELSE cx.detalle END::text AS detalle_movimiento,
        c.monto_cuota,
        COALESCE(c.moneda, 'ARS')::text AS moneda,
        c.numero_cuota AS posicion_cuota,
        COALESCE(cx.cuotas_totales, CASE WHEN c.carga_id IS NOT NULL THEN COUNT(*) OVER (PARTITION BY c.carga_id) END)::integer AS total_cuotas,
        c.pagado,
        c.p_caja_id AS caja_id,
        (NOT c.pagado
         AND date_trunc('month', c.fecha_estimada_pago) <= date_trunc('month', v_vencimiento_ciclo_actual)
        ) AS es_ciclo_actual,
        c.carga_id  -- grupo de carga historica (NULL para cuotas del flujo normal)
    FROM p_cuotas_detalle c
    LEFT JOIN p_caja cx ON c.p_caja_id = cx.p_caja_id
    LEFT JOIN p_estructuras_egresos eg ON eg.estructura_id = cx.estructura_egreso_id
    LEFT JOIN p_estructuras_egresos eg2 ON eg2.estructura_id = c.estructura_egreso_id
    WHERE c.user_id = v_user_id
      AND c.tarjeta_id = p_tarjeta_id
    ORDER BY c.pagado ASC, c.fecha_estimada_pago ASC;
END;
$function$
