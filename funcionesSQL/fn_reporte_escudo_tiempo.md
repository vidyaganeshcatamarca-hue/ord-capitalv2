CREATE OR REPLACE FUNCTION public.fn_reporte_escudo_tiempo()
 RETURNS TABLE(arsenal_total numeric, deuda_total numeric, deuda_60_dias numeric, capital_real numeric, capital_corto_plazo numeric, burn_rate_actual numeric, burn_rate_supervivencia numeric, dias_actual_deuda_total integer, dias_actual_deuda_corta integer, dias_supervivencia_deuda_total integer, dias_supervivencia_deuda_corta integer, ventana_dias_usada integer, estado_alerta_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_cotizacion_usd numeric;
    v_ventana_dias int;
    v_arsenal_billeteras numeric := 0;
    v_arsenal_inversiones numeric := 0;
    v_deuda_prestamos numeric := 0;
    v_deuda_tarjetas_total numeric := 0;
    v_deuda_tarjetas_60 numeric := 0;
    v_gasto_total numeric := 0;
    v_gasto_necesidad numeric := 0;
    v_burn_actual numeric := 0;
    v_burn_supervivencia numeric := 0;
    v_capital_real numeric := 0;
    v_capital_corto numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(
        (SELECT valor_por_usd FROM p_divisas WHERE nombre = 'USD' ORDER BY ultima_actualizacion DESC LIMIT 1),
        1.00
    ) INTO v_cotizacion_usd;

    SELECT COALESCE(SUM(
        CASE WHEN moneda = 'USD' THEN saldo_actual * v_cotizacion_usd ELSE saldo_actual END
    ), 0) INTO v_arsenal_billeteras
    FROM p_billeteras WHERE user_id = v_user_id AND activa = true;

    SELECT COALESCE(SUM(
        CASE WHEN b.moneda = 'USD' THEN
            (i.monto_invertido_original + (i.monto_invertido_original * (COALESCE(i.tasa_anual_tna,0) / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)) * v_cotizacion_usd
        ELSE
            (i.monto_invertido_original + (i.monto_invertido_original * (COALESCE(i.tasa_anual_tna,0) / 100) * (CURRENT_DATE - i.fecha_inicio) / 365))
        END
    ), 0) INTO v_arsenal_inversiones
    FROM p_inversiones i
    JOIN p_billeteras b ON i.billetera_origen_id = b.billetera_id
    WHERE i.user_id = v_user_id AND i.estado = 'activa';

    SELECT COALESCE(SUM(monto_total_deuda - monto_pagado_acumulado), 0) INTO v_deuda_prestamos
    FROM p_prestamos WHERE (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id)) AND tipo_flujo = 'debo' AND estado NOT IN ('cancelado', 'eliminado');

    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_deuda_tarjetas_total
    FROM (
        SELECT monto_cuota FROM p_compromisos_tarjeta WHERE user_id = v_user_id
        UNION ALL
        SELECT monto_cuota FROM p_cuotas_detalle WHERE user_id = v_user_id AND pagado = false
    ) sub;

    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_deuda_tarjetas_60
    FROM (
        SELECT monto_cuota, mes_periodo as fecha_pago FROM p_compromisos_tarjeta WHERE user_id = v_user_id
        UNION ALL
        SELECT monto_cuota, fecha_estimada_pago as fecha_pago FROM p_cuotas_detalle WHERE user_id = v_user_id AND pagado = false
    ) sub
    WHERE fecha_pago <= CURRENT_DATE + INTERVAL '60 days';

    -- FIX: date - date ya retorna integer (días), no necesita EXTRACT
    SELECT LEAST(180, GREATEST((CURRENT_DATE - MIN(fecha))::int, 1)) INTO v_ventana_dias
    FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'expense';

    IF v_ventana_dias IS NULL THEN v_ventana_dias := 1; END IF;

    SELECT COALESCE(SUM(valor_egreso), 0) INTO v_gasto_total
    FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= CURRENT_DATE - INTERVAL '180 days';

    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_gasto_necesidad
    FROM v_p_caja_reportable c
    JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'need' AND c.fecha >= CURRENT_DATE - INTERVAL '180 days';

    v_burn_actual := v_gasto_total / v_ventana_dias;
    v_burn_supervivencia := v_gasto_necesidad / v_ventana_dias;

    v_capital_real := (v_arsenal_billeteras + v_arsenal_inversiones) - (v_deuda_prestamos + v_deuda_tarjetas_total);
    v_capital_corto := (v_arsenal_billeteras + v_arsenal_inversiones) - v_deuda_tarjetas_60;

    RETURN QUERY SELECT
        (v_arsenal_billeteras + v_arsenal_inversiones)::numeric,
        (v_deuda_prestamos + v_deuda_tarjetas_total)::numeric,
        v_deuda_tarjetas_60::numeric,
        v_capital_real::numeric,
        v_capital_corto::numeric,
        v_burn_actual::numeric,
        v_burn_supervivencia::numeric,
        CASE WHEN v_capital_real <= 0 OR v_burn_actual <= 0 THEN 0 ELSE (v_capital_real / v_burn_actual)::integer END,
        CASE WHEN v_capital_corto <= 0 OR v_burn_actual <= 0 THEN 0 ELSE (v_capital_corto / v_burn_actual)::integer END,
        CASE WHEN v_capital_real <= 0 OR v_burn_supervivencia <= 0 THEN 0 ELSE (v_capital_real / v_burn_supervivencia)::integer END,
        CASE WHEN v_capital_corto <= 0 OR v_burn_supervivencia <= 0 THEN 0 ELSE (v_capital_corto / v_burn_supervivencia)::integer END,
        v_ventana_dias::integer,
        CASE
            WHEN v_capital_real <= 0 THEN 'critical'::text
            WHEN (v_capital_real / NULLIF(v_burn_supervivencia,0)) < 90 THEN 'warning'::text
            ELSE 'safe'::text
        END;
END;
$function$
