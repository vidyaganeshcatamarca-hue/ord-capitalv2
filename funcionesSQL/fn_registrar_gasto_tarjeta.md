CREATE OR REPLACE FUNCTION public.fn_registrar_gasto_tarjeta(p_tarjeta_id bigint, p_monto_total numeric, p_cuotas integer, p_estructura_egreso_id bigint, p_fecha date DEFAULT CURRENT_DATE, p_descripcion text DEFAULT NULL::text, p_detalle text DEFAULT NULL::text, p_es_compartido boolean DEFAULT false, p_proyecto_id bigint DEFAULT NULL::bigint, p_es_usd boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_caja_id bigint;
    v_monto_cuota numeric;
    v_i integer;
    v_mes_periodo date;
    v_fecha_estimada date;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_moneda_tarjeta text;
    v_moneda_local text;
    v_dia_compra int;
    v_mes_compra date;
    v_base_date date;
    v_cotizacion_usd numeric;
    v_moneda text;
    v_metadata jsonb := '{}'::jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT dia_cierre, dia_vencimiento, moneda_iso
      INTO v_dia_cierre, v_dia_vencimiento, v_moneda_tarjeta
      FROM p_tarjetas_credito
      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

    -- C-N2: la busqueda filtra por dueno; si no encontro la tarjeta, hay que cortar.
    -- La sobrecarga legacy (6 args) ya cortaba con error_card_no_billing_cycle.
    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_card_not_found", "params": {}}';
    END IF;

    v_dia_cierre := COALESCE(v_dia_cierre, 20);
    v_dia_vencimiento := COALESCE(v_dia_vencimiento, 10);

    -- Snapshot de cotizacion SOLO para auditoria. Sin conversion al comprar.
    IF p_es_usd THEN
        v_moneda := 'USD';
        SELECT COALESCE(
            (SELECT valor_por_usd FROM p_divisas WHERE nombre = 'USD' ORDER BY ultima_actualizacion DESC LIMIT 1),
            1.00
        ) INTO v_cotizacion_usd;
        v_metadata := jsonb_build_object(
            'es_compra_usd', true,
            'monto_usd', p_monto_total,
            'cotizacion_usd', v_cotizacion_usd
        );
    ELSE
        v_moneda := COALESCE(v_moneda_tarjeta, (SELECT COALESCE(moneda_default, 'ARS') FROM public.p_config_region WHERE user_id = v_user_id), 'ARS');
    END IF;

    -- INSERT explÃ­cito de moneda y es_usd (antes faltaba es_usd en columnas).
    INSERT INTO p_caja (
        user_id, tipo, tarjeta_id, valor_egreso, valor_ingreso, moneda, es_usd, nombre_cuenta_historico,
        fecha, es_compartido, proyecto_id, estructura_egreso_id, pagado_por_user_id, detalle, cuotas_totales, metadata
    )
    VALUES (
        v_user_id, 'expense', p_tarjeta_id, p_monto_total, 0, v_moneda, p_es_usd, p_descripcion,
        p_fecha, p_es_compartido, p_proyecto_id, p_estructura_egreso_id,
        CASE WHEN p_es_compartido THEN v_user_id ELSE NULL END,
        p_detalle, p_cuotas, v_metadata
    )
    RETURNING p_caja_id INTO v_caja_id;

    -- Cuota en moneda nativa (sin conversiÃ³n al comprar).
    v_monto_cuota := p_monto_total / p_cuotas;

    v_dia_compra := EXTRACT(DAY FROM p_fecha);
    v_mes_compra := date_trunc('month', p_fecha);

    IF v_dia_compra <= v_dia_cierre THEN
        v_base_date := v_mes_compra;
    ELSE
        v_base_date := v_mes_compra + INTERVAL '1 month';
    END IF;

    IF v_dia_vencimiento <= v_dia_cierre THEN
        v_base_date := v_base_date + INTERVAL '1 month';
    END IF;

    FOR v_i IN 0..(p_cuotas - 1) LOOP
        v_fecha_estimada := (v_base_date + (v_i || ' months')::interval) + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        SELECT date_trunc('month', fecha_inicio)::date INTO v_mes_periodo
          FROM public.fn_obtener_fechas_ciclo_presupuesto(v_fecha_estimada);

        INSERT INTO p_cuotas_detalle (
            user_id, tarjeta_id, numero_cuota, monto_cuota, moneda, fecha_estimada_pago, pagado, p_caja_id
        ) VALUES (
            v_user_id, p_tarjeta_id, (v_i + 1), v_monto_cuota, v_moneda, v_fecha_estimada, false, v_caja_id
        );

        INSERT INTO p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
        VALUES (p_tarjeta_id, v_user_id, v_monto_cuota, v_mes_periodo)
        ON CONFLICT (tarjeta_id, mes_periodo, user_id)
        DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
    END LOOP;

    RETURN v_caja_id;
END;
$function$
