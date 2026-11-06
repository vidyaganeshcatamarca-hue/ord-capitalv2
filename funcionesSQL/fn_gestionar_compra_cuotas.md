CREATE OR REPLACE FUNCTION public.fn_gestionar_compra_cuotas(p_tarjeta_id bigint, p_monto_total numeric, p_cuotas integer, p_fecha_inicio date, p_es_usd boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_monto_cuota numeric;
    v_i integer;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_dia_compra int;
    v_mes_compra date;
    v_base_date date;
    v_fecha_estimada date;
    v_mes_periodo date;
    v_cotizacion_usd numeric;
    v_moneda text;
    v_moneda_tarjeta text;
    v_metadata jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT dia_cierre, dia_vencimiento, moneda_iso
      INTO v_dia_cierre, v_dia_vencimiento, v_moneda_tarjeta
      FROM p_tarjetas_credito
      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

    v_dia_cierre := COALESCE(v_dia_cierre, 20);
    v_dia_vencimiento := COALESCE(v_dia_vencimiento, 10);

    IF p_es_usd THEN
        v_moneda := 'USD';
        SELECT COALESCE(
            (SELECT valor_por_usd FROM p_divisas WHERE nombre = 'USD' ORDER BY ultima_actualizacion DESC LIMIT 1),
            1.00
        ) INTO v_cotizacion_usd;
        v_metadata := jsonb_build_object(
            'es_compra_usd', true,
            'monto_usd_original', p_monto_total,
            'cotizacion_usd', v_cotizacion_usd
        );
    ELSE
        v_moneda := COALESCE(v_moneda_tarjeta, (SELECT COALESCE(moneda_default, 'ARS') FROM public.p_config_region WHERE user_id = v_user_id), 'ARS');
        v_metadata := '{}'::jsonb;
    END IF;

    -- Cuota en moneda nativa (sin conversiÃ³n al comprar).
    v_monto_cuota := p_monto_total / p_cuotas;

    v_dia_compra := EXTRACT(DAY FROM p_fecha_inicio);
    v_mes_compra := date_trunc('month', p_fecha_inicio)::date;

    IF v_dia_compra > v_dia_cierre THEN
        v_base_date := v_mes_compra + INTERVAL '1 month';
    ELSE
        v_base_date := v_mes_compra;
    END IF;

    FOR v_i IN 1..p_cuotas LOOP
        v_mes_periodo := (v_base_date + ((v_i - 1) || ' month')::interval)::date;
        v_fecha_estimada := (v_mes_periodo + INTERVAL '1 month') + ((v_dia_vencimiento - 1) || ' days')::interval;

        -- FIX bug pre-existente: agrega user_id (RLS) y columna moneda.
        -- Remueve total_cuotas y metadata (NO existen en p_cuotas_detalle; bugs histÃ³ricos).
        -- p_caja_id queda NULL (esta RPC no recibe p_caja y crea cuotas standalone).
        -- La metadata USD vive en p_caja.metadata (cotizacion snapshot al comprar).
        INSERT INTO p_cuotas_detalle (
            user_id, tarjeta_id, p_caja_id, numero_cuota, monto_cuota, moneda, fecha_estimada_pago
        ) VALUES (
            v_user_id, p_tarjeta_id, NULL, v_i, v_monto_cuota, v_moneda, v_fecha_estimada
        );
    END LOOP;
END;
$function$
