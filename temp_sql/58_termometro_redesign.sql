CREATE OR REPLACE FUNCTION public.fn_reporte_termometro_tarjeta(p_tarjeta_id bigint)
 RETURNS TABLE(nombre_tarjeta text, indice_estres numeric, capacidad_pago_promedio numeric,
               saldo_actual_total numeric, cuota_proxima numeric, moneda_proxima text,
               fecha_proxima date, estado_alerta text, estado_mensaje text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Redefinicion 2026-10-14 (modelo acordado con el dueno):
--   capacidad_pago_promedio: ingreso promedio mensual (180d) - resto de gastos
--     promedio mensual (180d). "Resto" = tipo 'expense' con tarjeta_id NULL:
--     quedan afuera TODAS las tarjetas (compras, pagos de resumen, ajustes).
--   cuota_proxima: la cuota individual que antes vence (una, no la suma del
--     ciclo), con su moneda real y fecha estimada.
--   indice_estres: carga sostenida del plan de cuotas = total pendiente
--     equivalente a moneda local / meses restantes hasta la ultima cuota /
--     capacidad x 100. El resumen impago NO entra (ya se senala aparte en
--     vencimientos/alertas); sin cotizacion no se inventa: aviso honesto.
--   semaforo: verde <=30, amarillo 30-60, rojo >60; capacidad <= 0 -> rojo.
DECLARE
    v_user_id bigint; v_antiguedad int;
    v_ingreso_prom_180 numeric; v_gasto_no_card_prom_180 numeric;
    v_capacidad_prom numeric; v_saldo_total numeric; v_nombre text;
    v_mono_local text;
    v_equiv_pendiente numeric; v_cuotas_sin_tasa int; v_ultima_fecha date;
    v_meses_restantes numeric; v_indice numeric;
    v_fecha_proxima date; v_cuota_num numeric; v_cuota_mono text;
    v_suma_bruta numeric; v_todas_usd boolean;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT (CURRENT_DATE - MIN(fecha))::int INTO v_antiguedad FROM public.p_caja WHERE user_id = v_user_id;
    IF v_antiguedad < 30 OR v_antiguedad IS NULL THEN
        RETURN QUERY SELECT 'pending'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
            NULL::text, NULL::date, 'green'::text, 'msg_learning_data'::text;
        RETURN;
    END IF;

    SELECT t.nombre_tarjeta INTO v_nombre FROM public.p_tarjetas_credito t
      WHERE t.tarjeta_id = p_tarjeta_id AND t.user_id = v_user_id;
    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_saldo_total FROM public.p_billeteras WHERE user_id = v_user_id;

    SELECT COALESCE(SUM(valor_ingreso), 0) / 6 INTO v_ingreso_prom_180
      FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'income'
        AND fecha >= CURRENT_DATE - INTERVAL '180 days';
    -- Gasto "resto": solo expenses sin tarjeta => excluye compras y pagos de
    -- TODAS las tarjetas (dos tarjetas: los gastos de la otra tampoco entran).
    SELECT COALESCE(SUM(valor_egreso), 0) / 6 INTO v_gasto_no_card_prom_180
      FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'expense'
        AND tarjeta_id IS NULL AND fecha >= CURRENT_DATE - INTERVAL '180 days';
    v_capacidad_prom := v_ingreso_prom_180 - v_gasto_no_card_prom_180;

    SELECT moneda_default INTO v_mono_local FROM public.p_config_region WHERE user_id = v_user_id;
    v_mono_local := COALESCE(v_mono_local, 'ARS');

    -- Proximo total pendiente en equivalente moneda local (via helper honesto:
    -- identidade sin cotizacion; cruce con p_divisas; sin tasa -> NULL).
    SELECT COALESCE(SUM(P.monto_local), 0),
           count(*) FILTER (WHERE P.monto_local IS NULL),
           MAX(P.fecha_estimada_pago)
      INTO v_equiv_pendiente, v_cuotas_sin_tasa, v_ultima_fecha
    FROM (
        SELECT cd.monto_cuota, cd.moneda, cd.fecha_estimada_pago,
               (public.fn_valor_a_moneda_local(cd.monto_cuota, cd.moneda, v_user_id)).valor AS monto_local
        FROM public.p_cuotas_detalle cd
        WHERE cd.tarjeta_id = p_tarjeta_id AND cd.pagado = false
    ) P;

    -- Proximo pago de la tarjeta: TODAS las cuotas impagas que comparten la
    -- fecha estimada mas proxima (asi coincide con el estimado del resumen
    -- cuando todas caen el mismo dia). Moneda: USD si todas son USD; si no,
    -- equivalente en moneda local.
    SELECT MIN(cd.fecha_estimada_pago) INTO v_fecha_proxima
      FROM public.p_cuotas_detalle cd
      WHERE cd.tarjeta_id = p_tarjeta_id AND cd.pagado = false;

    IF v_fecha_proxima IS NOT NULL THEN
        SELECT COALESCE(SUM(P.monto_local), 0),
               COALESCE(SUM(P.monto_cuota), 0),
               COALESCE(bool_and(P.moneda = 'USD'), false)
          INTO v_cuota_num, v_suma_bruta, v_todas_usd
          FROM (
              SELECT cd.monto_cuota, cd.moneda,
                     (public.fn_valor_a_moneda_local(cd.monto_cuota, cd.moneda, v_user_id)).valor AS monto_local
              FROM public.p_cuotas_detalle cd
              WHERE cd.tarjeta_id = p_tarjeta_id AND cd.pagado = false
                AND cd.fecha_estimada_pago = v_fecha_proxima
          ) P;
        v_cuota_mono := CASE WHEN v_todas_usd AND v_mono_local <> 'USD' THEN 'USD' ELSE v_mono_local END;
        v_cuota_num := CASE WHEN v_todas_usd AND v_mono_local <> 'USD' THEN v_suma_bruta
                            ELSE v_cuota_num END;
    END IF;

    IF v_fecha_proxima IS NULL THEN
        RETURN QUERY SELECT v_nombre, 0::numeric, v_capacidad_prom, v_saldo_total,
            0::numeric, NULL::text, NULL::date, 'green'::text, 'msg_no_cuotas_pending'::text;
        RETURN;
    END IF;

    IF v_cuotas_sin_tasa > 0 THEN
        RETURN QUERY SELECT v_nombre, NULL::numeric, v_capacidad_prom, v_saldo_total,
            v_cuota_num, v_cuota_mono, v_fecha_proxima,
            'yellow'::text, 'msg_cotizacion_no_soportada'::text;
        RETURN;
    END IF;

    v_meses_restantes := GREATEST(1, ceil((v_ultima_fecha - CURRENT_DATE)::numeric / 30));
    v_indice := NULL;
    IF v_capacidad_prom > 0 THEN
        v_indice := ROUND((v_equiv_pendiente / v_meses_restantes / v_capacidad_prom) * 100, 1);
    END IF;

    IF v_capacidad_prom <= 0 THEN
        RETURN QUERY SELECT v_nombre, NULL::numeric, v_capacidad_prom, v_saldo_total,
            v_cuota_num, v_cuota_mono, v_fecha_proxima,
            'red'::text, 'msg_insufficient_balance_deficit'::text;
    ELSIF v_indice <= 30 THEN
        RETURN QUERY SELECT v_nombre, v_indice, v_capacidad_prom, v_saldo_total,
            v_cuota_num, v_cuota_mono, v_fecha_proxima,
            'green'::text, 'ok'::text;
    ELSIF v_indice <= 60 THEN
        RETURN QUERY SELECT v_nombre, v_indice, v_capacidad_prom, v_saldo_total,
            v_cuota_num, v_cuota_mono, v_fecha_proxima,
            'yellow'::text, 'msg_term_medium_quota'::text;
    ELSE
        RETURN QUERY SELECT v_nombre, v_indice, v_capacidad_prom, v_saldo_total,
            v_cuota_num, v_cuota_mono, v_fecha_proxima,
            'red'::text, 'msg_term_over_capacity'::text;
    END IF;
END;
$function$