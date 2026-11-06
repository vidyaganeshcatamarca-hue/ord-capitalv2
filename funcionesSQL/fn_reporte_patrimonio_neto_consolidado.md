CREATE OR REPLACE FUNCTION public.fn_reporte_patrimonio_neto_consolidado()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_cotizacion_usd numeric;
    v_moneda_local text;

    v_billeteras_ars numeric := 0;
    v_billeteras_usd numeric := 0;
    v_inversiones_ars numeric := 0;
    v_inversiones_usd numeric := 0;
    v_sobres_ars numeric := 0;
    v_sobres_usd numeric := 0;

    v_deudas numeric := 0;

    v_activo_total_ars numeric;
    v_pasivo_total_ars numeric;
    v_patrimonio_neto_ars numeric;
    v_patrimonio_neto_usd numeric;

    v_evolucion_12m jsonb := '[]'::jsonb;
    v_patrimonio_mes numeric;
    v_mes date;
    v_ingresos_mes numeric;
    v_egresos_mes numeric;
    v_ipc_mes numeric;
    v_patrimonio_acumulado numeric;

    v_patrimonio_hace_12m numeric;
    v_variacion_nominal numeric;
    v_inflacion_12m numeric;
    v_variacion_real numeric;
    v_mes_record date;
    v_patrimonio_record numeric;

    i int;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS') INTO v_moneda_local;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    -- La cotizacion que sirve es la del dolar EN LA MONEDA LOCAL del usuario, no la fila 'USD'
    -- (que vale 1 por definicion). Antes se leia 'USD' y los saldos en dolares se sumaban 1:1.
    SELECT r.moneda_default::text INTO v_moneda_local
    FROM p_config_region r WHERE r.user_id = v_user_id;

    SELECT p.valor_por_usd INTO v_cotizacion_usd
    FROM p_divisas p
    WHERE p.nombre = COALESCE(v_moneda_local, 'USD')
    ORDER BY p.ultima_actualizacion DESC LIMIT 1;
    v_cotizacion_usd := COALESCE(v_cotizacion_usd, 1.00);

    SELECT
        COALESCE(SUM(CASE WHEN moneda = v_moneda_local THEN saldo_actual ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN saldo_actual ELSE 0 END), 0)
    INTO v_billeteras_ars, v_billeteras_usd
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false;

    SELECT
        COALESCE(SUM(CASE WHEN moneda = v_moneda_local THEN saldo_actual ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN saldo_actual ELSE 0 END), 0)
    INTO v_sobres_ars, v_sobres_usd
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = true;

    SELECT
        COALESCE(SUM(CASE WHEN moneda = v_moneda_local THEN
            CASE WHEN tasa_anual_tna > 0 THEN
                monto_invertido_original + (monto_invertido_original * (tasa_anual_tna / 100) * (CURRENT_DATE - fecha_inicio) / 365)
            ELSE COALESCE(valor_mercado_actual, monto_invertido_original) END
        ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN
            CASE WHEN tasa_anual_tna > 0 THEN
                monto_invertido_original + (monto_invertido_original * (tasa_anual_tna / 100) * (CURRENT_DATE - fecha_inicio) / 365)
            ELSE COALESCE(valor_mercado_actual, monto_invertido_original) END
        ELSE 0 END), 0)
    INTO v_inversiones_ars, v_inversiones_usd
    FROM p_inversiones
    WHERE user_id = v_user_id AND estado = 'activa';

    SELECT COALESCE(SUM(monto_total_deuda - monto_pagado_acumulado), 0) INTO v_deudas
    FROM p_prestamos
    WHERE user_id = v_user_id AND tipo_flujo = 'debo' AND estado != 'cancelado';

    v_activo_total_ars := v_billeteras_ars + v_sobres_ars + v_inversiones_ars +
                          ((v_billeteras_usd + v_sobres_usd + v_inversiones_usd) * v_cotizacion_usd);
    v_pasivo_total_ars := v_deudas;
    v_patrimonio_neto_ars := v_activo_total_ars - v_pasivo_total_ars;
    v_patrimonio_neto_usd := CASE WHEN v_cotizacion_usd > 0 THEN v_patrimonio_neto_ars / v_cotizacion_usd ELSE 0 END;

    v_patrimonio_acumulado := v_patrimonio_neto_ars;
    v_patrimonio_record := v_patrimonio_neto_ars;
    v_mes_record := CURRENT_DATE;

    FOR i IN 1..12 LOOP
        v_mes := date_trunc('month', CURRENT_DATE - (i || ' months')::interval);

        SELECT
            COALESCE(SUM(CASE WHEN tipo = 'income' THEN valor_ingreso ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN tipo = 'expense' THEN valor_egreso ELSE 0 END), 0)
        INTO v_ingresos_mes, v_egresos_mes
        FROM p_caja
        WHERE user_id = v_user_id
          AND fecha >= v_mes
          AND fecha < v_mes + INTERVAL '1 month';

        v_patrimonio_acumulado := v_patrimonio_acumulado - v_ingresos_mes + v_egresos_mes;

        SELECT COALESCE(valor_ipc, 0) INTO v_ipc_mes
        FROM p_indices_precios
        WHERE anio = EXTRACT(YEAR FROM v_mes) AND mes = EXTRACT(MONTH FROM v_mes);

        IF v_ipc_mes IS NULL THEN v_ipc_mes := 0; END IF;

        v_evolucion_12m := jsonb_build_array(jsonb_build_object(
            'mes', to_char(v_mes, 'YYYY-MM'),
            'patrimonio_ars', ROUND(v_patrimonio_acumulado, 2),
            'inflacion_mensual', v_ipc_mes
        )) || v_evolucion_12m;

        IF v_patrimonio_acumulado > v_patrimonio_record THEN
            v_patrimonio_record := v_patrimonio_acumulado;
            v_mes_record := v_mes;
        END IF;
    END LOOP;

    v_patrimonio_hace_12m := (v_evolucion_12m->0->>'patrimonio_ars')::numeric;

    IF v_patrimonio_hace_12m > 0 THEN
        v_variacion_nominal := ((v_patrimonio_neto_ars - v_patrimonio_hace_12m) / ABS(v_patrimonio_hace_12m)) * 100;
    ELSE
        v_variacion_nominal := 0;
    END IF;

    SELECT COALESCE((EXP(SUM(LN(1 + (valor_ipc / 100)))) - 1) * 100, 0)
    INTO v_inflacion_12m
    FROM p_indices_precios
    WHERE to_date(anio::text || '-' || mes::text || '-01', 'YYYY-MM-DD') >= CURRENT_DATE - INTERVAL '12 months';

    IF v_inflacion_12m > 0 OR v_variacion_nominal != 0 THEN
        v_variacion_real := ((1 + v_variacion_nominal/100) / (1 + v_inflacion_12m/100) - 1) * 100;
    ELSE
        v_variacion_real := 0;
    END IF;

    RETURN jsonb_build_object(
        'actual', jsonb_build_object(
            'patrimonio_neto_ars', ROUND(v_patrimonio_neto_ars, 2),
            'patrimonio_neto_usd', ROUND(v_patrimonio_neto_usd, 2),
            'cotizacion_usd', v_cotizacion_usd,
            'activo_total_ars', ROUND(v_activo_total_ars, 2),
            'pasivo_total_ars', ROUND(v_pasivo_total_ars, 2)
        ),
        'desglose_activos', jsonb_build_object(
            'billeteras', jsonb_build_object('ars', v_billeteras_ars, 'usd', v_billeteras_usd),
            'inversiones', jsonb_build_object('ars', v_inversiones_ars, 'usd', v_inversiones_usd),
            'sobres', jsonb_build_object('ars', v_sobres_ars, 'usd', v_sobres_usd)
        ),
        'evolucion', jsonb_build_object(
            'variacion_nominal_12m', ROUND(v_variacion_nominal, 2),
            'inflacion_acumulada_12m', ROUND(v_inflacion_12m, 2),
            'variacion_real_12m', ROUND(v_variacion_real, 2),
            'veredicto', CASE
                WHEN v_variacion_real > 5 THEN 'wealth_gained'
                WHEN v_variacion_real >= -2 THEN 'wealth_matched'
                ELSE 'wealth_lost'
            END,
            'mensaje_key', CASE
                WHEN v_variacion_real > 5 THEN 'msg_wealth_gained'
                WHEN v_variacion_real >= -2 THEN 'msg_wealth_matched'
                ELSE 'msg_wealth_lost'
            END,
            'mes_record', to_char(v_mes_record, 'YYYY-MM'),
            'patrimonio_record_ars', ROUND(v_patrimonio_record, 2),
            'historial_12m', v_evolucion_12m
        )
    );
END;
$function$

DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_cotizacion_usd numeric;
    v_moneda_local text;

    v_billeteras_ars numeric := 0;
    v_billeteras_usd numeric := 0;
    v_inversiones_ars numeric := 0;
    v_inversiones_usd numeric := 0;
    v_sobres_ars numeric := 0;
    v_sobres_usd numeric := 0;

    v_deudas numeric := 0;

    v_activo_total_ars numeric;
    v_pasivo_total_ars numeric;
    v_patrimonio_neto_ars numeric;
    v_patrimonio_neto_usd numeric;

    v_evolucion_12m jsonb := '[]'::jsonb;
    v_patrimonio_mes numeric;
    v_mes date;
    v_ingresos_mes numeric;
    v_egresos_mes numeric;
    v_ipc_mes numeric;
    v_patrimonio_acumulado numeric;

    v_patrimonio_hace_12m numeric;
    v_variacion_nominal numeric;
    v_inflacion_12m numeric;
    v_variacion_real numeric;
    v_mes_record date;
    v_patrimonio_record numeric;

    i int;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    -- La cotizacion que sirve es la del dolar EN LA MONEDA LOCAL del usuario, no la fila 'USD'
    -- (que vale 1 por definicion). Antes se leia 'USD' y los saldos en dolares se sumaban 1:1.
    SELECT r.moneda_default::text INTO v_moneda_local
    FROM p_config_region r WHERE r.user_id = v_user_id;

    SELECT p.valor_por_usd INTO v_cotizacion_usd
    FROM p_divisas p
    WHERE p.nombre = COALESCE(v_moneda_local, 'USD')
    ORDER BY p.ultima_actualizacion DESC LIMIT 1;
    v_cotizacion_usd := COALESCE(v_cotizacion_usd, 1.00);

    SELECT
        COALESCE(SUM(CASE WHEN moneda = 'ARS' THEN saldo_actual ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN saldo_actual ELSE 0 END), 0)
    INTO v_billeteras_ars, v_billeteras_usd
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false;

    SELECT
        COALESCE(SUM(CASE WHEN moneda = 'ARS' THEN saldo_actual ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN saldo_actual ELSE 0 END), 0)
    INTO v_sobres_ars, v_sobres_usd
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = true;

    SELECT
        COALESCE(SUM(CASE WHEN moneda = 'ARS' THEN
            CASE WHEN tasa_anual_tna > 0 THEN
                monto_invertido_original + (monto_invertido_original * (tasa_anual_tna / 100) * (CURRENT_DATE - fecha_inicio) / 365)
            ELSE COALESCE(valor_mercado_actual, monto_invertido_original) END
        ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN
            CASE WHEN tasa_anual_tna > 0 THEN
                monto_invertido_original + (monto_invertido_original * (tasa_anual_tna / 100) * (CURRENT_DATE - fecha_inicio) / 365)
            ELSE COALESCE(valor_mercado_actual, monto_invertido_original) END
        ELSE 0 END), 0)
    INTO v_inversiones_ars, v_inversiones_usd
    FROM p_inversiones
    WHERE user_id = v_user_id AND estado = 'activa';

    SELECT COALESCE(SUM(monto_total_deuda - monto_pagado_acumulado), 0) INTO v_deudas
    FROM p_prestamos
    WHERE user_id = v_user_id AND tipo_flujo = 'debo' AND estado != 'cancelado';

    v_activo_total_ars := v_billeteras_ars + v_sobres_ars + v_inversiones_ars +
                          ((v_billeteras_usd + v_sobres_usd + v_inversiones_usd) * v_cotizacion_usd);
    v_pasivo_total_ars := v_deudas;
    v_patrimonio_neto_ars := v_activo_total_ars - v_pasivo_total_ars;
    v_patrimonio_neto_usd := CASE WHEN v_cotizacion_usd > 0 THEN v_patrimonio_neto_ars / v_cotizacion_usd ELSE 0 END;

    v_patrimonio_acumulado := v_patrimonio_neto_ars;
    v_patrimonio_record := v_patrimonio_neto_ars;
    v_mes_record := CURRENT_DATE;

    FOR i IN 1..12 LOOP
        v_mes := date_trunc('month', CURRENT_DATE - (i || ' months')::interval);

        SELECT
            COALESCE(SUM(CASE WHEN tipo = 'income' THEN valor_ingreso ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN tipo = 'expense' THEN valor_egreso ELSE 0 END), 0)
        INTO v_ingresos_mes, v_egresos_mes
        FROM p_caja
        WHERE user_id = v_user_id
          AND fecha >= v_mes
          AND fecha < v_mes + INTERVAL '1 month';

        v_patrimonio_acumulado := v_patrimonio_acumulado - v_ingresos_mes + v_egresos_mes;

        SELECT COALESCE(valor_ipc, 0) INTO v_ipc_mes
        FROM p_indices_precios
        WHERE anio = EXTRACT(YEAR FROM v_mes) AND mes = EXTRACT(MONTH FROM v_mes);

        IF v_ipc_mes IS NULL THEN v_ipc_mes := 0; END IF;

        v_evolucion_12m := jsonb_build_array(jsonb_build_object(
            'mes', to_char(v_mes, 'YYYY-MM'),
            'patrimonio_ars', ROUND(v_patrimonio_acumulado, 2),
            'inflacion_mensual', v_ipc_mes
        )) || v_evolucion_12m;

        IF v_patrimonio_acumulado > v_patrimonio_record THEN
            v_patrimonio_record := v_patrimonio_acumulado;
            v_mes_record := v_mes;
        END IF;
    END LOOP;

    v_patrimonio_hace_12m := (v_evolucion_12m->0->>'patrimonio_ars')::numeric;

    IF v_patrimonio_hace_12m > 0 THEN
        v_variacion_nominal := ((v_patrimonio_neto_ars - v_patrimonio_hace_12m) / ABS(v_patrimonio_hace_12m)) * 100;
    ELSE
        v_variacion_nominal := 0;
    END IF;

    SELECT COALESCE((EXP(SUM(LN(1 + (valor_ipc / 100)))) - 1) * 100, 0)
    INTO v_inflacion_12m
    FROM p_indices_precios
    WHERE to_date(anio::text || '-' || mes::text || '-01', 'YYYY-MM-DD') >= CURRENT_DATE - INTERVAL '12 months';

    IF v_inflacion_12m > 0 OR v_variacion_nominal != 0 THEN
        v_variacion_real := ((1 + v_variacion_nominal/100) / (1 + v_inflacion_12m/100) - 1) * 100;
    ELSE
        v_variacion_real := 0;
    END IF;

    RETURN jsonb_build_object(
        'actual', jsonb_build_object(
            'patrimonio_neto_ars', ROUND(v_patrimonio_neto_ars, 2),
            'patrimonio_neto_usd', ROUND(v_patrimonio_neto_usd, 2),
            'cotizacion_usd', v_cotizacion_usd,
            'activo_total_ars', ROUND(v_activo_total_ars, 2),
            'pasivo_total_ars', ROUND(v_pasivo_total_ars, 2)
        ),
        'desglose_activos', jsonb_build_object(
            'billeteras', jsonb_build_object('ars', v_billeteras_ars, 'usd', v_billeteras_usd),
            'inversiones', jsonb_build_object('ars', v_inversiones_ars, 'usd', v_inversiones_usd),
            'sobres', jsonb_build_object('ars', v_sobres_ars, 'usd', v_sobres_usd)
        ),
        'evolucion', jsonb_build_object(
            'variacion_nominal_12m', ROUND(v_variacion_nominal, 2),
            'inflacion_acumulada_12m', ROUND(v_inflacion_12m, 2),
            'variacion_real_12m', ROUND(v_variacion_real, 2),
            'veredicto', CASE
                WHEN v_variacion_real > 5 THEN 'wealth_gained'
                WHEN v_variacion_real >= -2 THEN 'wealth_matched'
                ELSE 'wealth_lost'
            END,
            'mensaje_key', CASE
                WHEN v_variacion_real > 5 THEN 'msg_wealth_gained'
                WHEN v_variacion_real >= -2 THEN 'msg_wealth_matched'
                ELSE 'msg_wealth_lost'
            END,
            'mes_record', to_char(v_mes_record, 'YYYY-MM'),
            'patrimonio_record_ars', ROUND(v_patrimonio_record, 2),
            'historial_12m', v_evolucion_12m
        )
    );
END;
$function$

-- NOTA: H2a: idem. Sus claves de salida siguen nombradas _ars; parametrizarlas es H2b, fuera de la WU1. Funcion unica: el overload legado con p_user_id uuid se elimino el 2026-10-12.
