CREATE OR REPLACE FUNCTION public.fn_reporte_mapa_tarjetas()
 RETURNS TABLE(tarjeta_id bigint, nombre_tarjeta text, limite_un_pago_total numeric, un_pago_disponible numeric, limite_cuotas_total numeric, cuotas_disponible numeric, estado_config text, dia_cierre integer, dia_vencimiento integer, banco text, color text, recargo_dolar_pct numeric, cotizacion_usd numeric, un_pago_consumido_ars numeric, un_pago_consumido_usd numeric, cuotas_futuras_consumido_ars numeric, cuotas_futuras_consumido_usd numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hoy date := CURRENT_DATE;
    v_dia_hoy int := EXTRACT(DAY FROM CURRENT_DATE);
    v_mes_actual date := date_trunc('month', CURRENT_DATE);
    r_tarjeta RECORD;
    v_inicio_ciclo date;
    v_fin_ciclo date;
    v_vencimiento_ciclo date;
    v_cotizacion_usd numeric;
    v_consumo_un_pago_ars numeric;
    v_consumo_un_pago_usd numeric;
    v_consumo_un_pago_total_ars_equiv numeric;
    v_consumo_cuotas_ars numeric;
    v_consumo_cuotas_usd numeric;
    v_consumo_cuotas_total_ars_equiv numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(
        (SELECT valor_por_usd FROM p_divisas WHERE nombre = COALESCE(
            (SELECT moneda_default FROM p_config_region WHERE user_id = v_user_id),
            'ARS') ORDER BY ultima_actualizacion DESC LIMIT 1),
        1.00
    ) INTO v_cotizacion_usd;

    FOR r_tarjeta IN
        SELECT t.tarjeta_id, t.nombre_tarjeta, t.dia_cierre, t.dia_vencimiento,
               t.banco, t.color, t.limite_un_pago, t.limite_cuotas, t.recargo_dolar_pct
        FROM p_tarjetas_credito t
        WHERE t.user_id = v_user_id AND t.activa = true
    LOOP
        IF COALESCE(r_tarjeta.limite_un_pago, 0) = 0 AND COALESCE(r_tarjeta.limite_cuotas, 0) = 0 THEN
            RETURN QUERY SELECT
                r_tarjeta.tarjeta_id, r_tarjeta.nombre_tarjeta,
                0::numeric, 0::numeric, 0::numeric, 0::numeric,
                'requires_configuration'::text,
                r_tarjeta.dia_cierre, r_tarjeta.dia_vencimiento, r_tarjeta.banco, r_tarjeta.color,
                COALESCE(r_tarjeta.recargo_dolar_pct, 0.00)::numeric,
                COALESCE(v_cotizacion_usd, 1.00)::numeric,
                0::numeric, 0::numeric, 0::numeric, 0::numeric;
            CONTINUE;
        END IF;

        IF v_dia_hoy <= r_tarjeta.dia_cierre THEN
            v_inicio_ciclo := (v_mes_actual - INTERVAL '1 month') + (r_tarjeta.dia_cierre * INTERVAL '1 day');
            v_fin_ciclo := v_mes_actual + ((r_tarjeta.dia_cierre - 1) * INTERVAL '1 day');
        ELSE
            v_inicio_ciclo := v_mes_actual + (r_tarjeta.dia_cierre * INTERVAL '1 day');
            v_fin_ciclo := (v_mes_actual + INTERVAL '1 month') + ((r_tarjeta.dia_cierre - 1) * INTERVAL '1 day');
        END IF;

        IF r_tarjeta.dia_vencimiento <= r_tarjeta.dia_cierre THEN
            v_vencimiento_ciclo := (date_trunc('month', v_fin_ciclo) + INTERVAL '1 month') + ((r_tarjeta.dia_vencimiento - 1) * INTERVAL '1 day');
        ELSE
            v_vencimiento_ciclo := date_trunc('month', v_fin_ciclo) + ((r_tarjeta.dia_vencimiento - 1) * INTERVAL '1 day');
        END IF;

        SELECT
            COALESCE(SUM(CASE WHEN cd.moneda = 'ARS' THEN cd.monto_cuota ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0)
          INTO v_consumo_un_pago_ars, v_consumo_un_pago_usd
          FROM p_cuotas_detalle cd
          WHERE cd.tarjeta_id = r_tarjeta.tarjeta_id AND cd.pagado = false
            AND cd.fecha_estimada_pago <= v_vencimiento_ciclo;
        v_consumo_un_pago_total_ars_equiv := v_consumo_un_pago_ars + (v_consumo_un_pago_usd * v_cotizacion_usd);

        SELECT
            COALESCE(SUM(CASE WHEN cd.moneda = 'ARS' THEN cd.monto_cuota ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0)
          INTO v_consumo_cuotas_ars, v_consumo_cuotas_usd
          FROM p_cuotas_detalle cd
          WHERE cd.tarjeta_id = r_tarjeta.tarjeta_id AND cd.pagado = false
            AND cd.fecha_estimada_pago > v_vencimiento_ciclo;
        v_consumo_cuotas_total_ars_equiv := v_consumo_cuotas_ars + (v_consumo_cuotas_usd * v_cotizacion_usd);

        RETURN QUERY SELECT
            r_tarjeta.tarjeta_id, r_tarjeta.nombre_tarjeta, r_tarjeta.limite_un_pago,
            (r_tarjeta.limite_un_pago - v_consumo_un_pago_total_ars_equiv),
            r_tarjeta.limite_cuotas,
            (r_tarjeta.limite_cuotas - v_consumo_cuotas_total_ars_equiv),
            'ok'::text,
            r_tarjeta.dia_cierre, r_tarjeta.dia_vencimiento, r_tarjeta.banco, r_tarjeta.color,
            COALESCE(r_tarjeta.recargo_dolar_pct, 0.00)::numeric,
            v_cotizacion_usd,
            v_consumo_un_pago_ars, v_consumo_un_pago_usd,
            v_consumo_cuotas_ars, v_consumo_cuotas_usd;
    END LOOP;
END;
$function$
