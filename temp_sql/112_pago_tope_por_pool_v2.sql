-- ============================================================================
-- 112 - Pago de resumen anterior, ronda 2: el tope por pool no pierde plata
--
--   Sale de la verificacion independiente de la 108. El tope por pool era correcto
--   (dejo de marcar como pagado lo que no entro), pero tenia cuatro consecuencias que
--   la 108 no cubria:
--
--   (a) SOBRANTE PERDIDO. Con p_resumen_real declarado, la rama que acredita el
--       excedente lo calculaba contra el resumen del banco y nunca miraba lo que no se
--       habia podido aplicar. La billetera se debitaba y el dinero no aparecia en
--       ningun lado. Repro: resumen 440.666,67, pago 300.000, ventana de 440.666,67 ->
--       177.000 evaporados.
--   (b) DOBLE CONTEO. La "Diferencia Tarjeta" se calculaba como resumen_real - aplicado,
--       contando como gasto la deuda que seguia viva como cuota impaga.
--   (c) FIFO INVERTIDO. El tope salteaba (CONTINUE) la cuota que no entraba y seguia con
--       las mas baratas: se pagaba la 1ra y la 3ra dejando impaga la 2da, la mas cara.
--       Ademas el ORDER BY no desempataba: todas las cuotas de un resumen comparten
--       fecha_estimada_pago, asi que el subconjunto no era reproducible.
--   (d) COMPROMISO DEL MES. Cada cuota pagada marcaba pagado el mes entero en
--       p_compromisos_tarjeta, con cuotas de ese mes todavia impagas.
--
--   Alcance: fn_registrar_pago_tarjeta_multi y fn_liquidar_ciclo_tarjeta_multi. El modo
--   legacy (sin ventana) sigue igual.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_registrar_pago_tarjeta_multi(p_tarjeta_id bigint, p_fecha_pago date, p_pagos jsonb, p_cuotas_adelantar bigint[] DEFAULT NULL::bigint[], p_resumen_real numeric DEFAULT NULL::numeric, p_cotizacion_usd numeric DEFAULT NULL::numeric, p_no_acreditar_favor boolean DEFAULT false, p_monto_a_favor_explicito numeric DEFAULT NULL::numeric, p_objetivo text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$


DECLARE
    v_user_id bigint;
    v_caja_id bigint;
    v_primer_caja_id bigint;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_recargo_dolar_pct numeric;
    v_cotizacion_usd numeric;
    v_sobrante_total numeric;
    v_cuota_adelantada_id bigint;
    v_cuota_adelantada_monto numeric;
    v_cuota_adelantada_moneda text;
    v_total_adelantado_ars numeric := 0;
    v_total_adelantado_usd numeric := 0;
    v_cuotas_adelantadas_log jsonb := '[]'::jsonb;
    v_linea jsonb;
    v_pago jsonb;
    v_billetera_id bigint;
    v_monto numeric;
    v_target text;
    v_moneda_pago text;
    v_moneda_local text;
    v_moneda_target text;
    v_monto_target numeric;
    v_saldo_billetera numeric;
    v_total_pagado numeric := 0;
    v_total_favor_ars numeric := 0;
    v_total_favor_usd numeric := 0;
    v_pagos_aplicados jsonb := '[]'::jsonb;
    v_seen_billeteras jsonb := '{}'::jsonb;
    v_dup boolean;
    v_wallet_key text;
    v_saldo_favor_inicial_ars numeric := 0;
    v_saldo_favor_inicial_usd numeric := 0;
    v_saldo_favor_actual_ars numeric := 0;
    v_saldo_favor_actual_usd numeric := 0;
    v_favor_disponible_equiv numeric := 0;
    v_deficit numeric := 0;
    v_tomar_ars numeric := 0;
    v_tomar_usd numeric := 0;
    v_total_mes_calculado_ars numeric := 0;
    v_total_mes_calculado_usd numeric := 0;
    v_prox_venc date;
    v_objetivo_desde date := NULL;
    v_objetivo_hasta date := NULL;
    v_favor_acreditado numeric := 0;
    v_cubierto_res numeric := 0;
    v_favor_extra_res numeric := 0;
    v_pendiente_ventana numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS') INTO v_moneda_local;

    SELECT dia_cierre, dia_vencimiento,
           COALESCE(saldo_a_favor, 0), COALESCE(saldo_a_favor_usd, 0)
      INTO v_dia_cierre, v_dia_vencimiento,
           v_saldo_favor_inicial_ars, v_saldo_favor_inicial_usd
      FROM p_tarjetas_credito
      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

    v_recargo_dolar_pct := 0;

    IF p_cotizacion_usd IS NOT NULL THEN
        v_cotizacion_usd := p_cotizacion_usd;
    ELSE
        SELECT COALESCE(
            (SELECT valor_por_usd FROM p_divisas WHERE nombre = COALESCE(
                (SELECT moneda_default FROM p_config_region WHERE user_id = v_user_id),
                'ARS') ORDER BY ultima_actualizacion DESC LIMIT 1),
            1.00)
          INTO v_cotizacion_usd;
    END IF;

    IF p_resumen_real IS NOT NULL AND p_resumen_real < 0 THEN
        RAISE EXCEPTION '{"key": "error_resumen_real_invalido", "params": {}}';
    END IF;

    -- Objetivo de pago (opcional): 'anterior' | 'actual' | NULL.
    -- NULL = comportamiento legacy (liquida todas las cuotas hasta el ciclo en curso).
    -- Con objetivo, el pago se aplica SOLO a las cuotas del resumen elegido,
    -- con la misma logica de proximo vencimiento que fn_reporte_vencimientos_tarjetas
    -- (mes de la fecha de pago + dia_vencimiento). Una sola fuente de verdad para
    -- los limites del ciclo entre reporte y pago.
    IF p_objetivo IS NOT NULL AND p_objetivo NOT IN ('anterior', 'actual') THEN
        RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
    END IF;

    IF p_objetivo IS NOT NULL THEN
        -- Fix 2026-10-28: el ciclo del resumen se calcula con CURRENT_DATE, igual que
        -- fn_reporte_vencimientos_tarjetas, y NO con p_fecha_pago. p_fecha_pago es la
        -- fecha contable del movimiento y el frontend la deja editar: si el usuario
        -- pagaba la deuda vencida de octubre con una fecha del ciclo siguiente, la
        -- ventana saltaba de mes y se llevaba puesto el resumen de noviembre entero.
        -- Reporte y pago tienen que mirar el mismo ciclo; la fecha del movimiento no
        -- decide que resumen se paga.
        IF EXTRACT(DAY FROM CURRENT_DATE) <= v_dia_vencimiento THEN
            v_prox_venc := date_trunc('month', CURRENT_DATE) + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        ELSE
            v_prox_venc := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        END IF;
        IF p_objetivo = 'anterior' THEN
            v_objetivo_hasta := date_trunc('month', v_prox_venc)::date - 1;
        ELSE
            v_objetivo_desde := date_trunc('month', v_prox_venc)::date;
            v_objetivo_hasta := v_prox_venc::date;
        END IF;
        -- El objetivo elegido debe tener al menos una cuota pendiente.
        IF NOT EXISTS (
            SELECT 1 FROM p_cuotas_detalle
            WHERE tarjeta_id = p_tarjeta_id AND pagado = false
              AND (v_objetivo_desde IS NULL OR fecha_estimada_pago >= v_objetivo_desde)
              AND (v_objetivo_hasta IS NULL OR fecha_estimada_pago <= v_objetivo_hasta)
        ) THEN
            RAISE EXCEPTION '{"key": "error_resumen_sin_cuotas_pendientes", "params": {}}';
        END IF;
    END IF;

    FOR v_linea IN
        SELECT jsonb_array_elements(p_pagos)
    LOOP
        v_billetera_id := NULLIF(v_linea->>'billetera_id', '')::bigint;
        v_monto := NULLIF(v_linea->>'monto', '')::numeric;
        v_target := NULLIF(v_linea->>'target_moneda_cuota', '');
        v_moneda_pago := NULL;
        v_saldo_billetera := 0;

        IF v_monto IS NULL OR v_monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
        END IF;

        IF v_billetera_id IS NULL THEN
            v_moneda_pago := v_linea->>'moneda';
            IF v_moneda_pago IS NULL OR v_moneda_pago NOT IN (v_moneda_local, 'USD') THEN
                RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
            END IF;
        ELSE
            SELECT moneda, COALESCE(saldo_actual, 0)
              INTO v_moneda_pago, v_saldo_billetera
              FROM p_billeteras
              WHERE billetera_id = v_billetera_id AND user_id = v_user_id
                AND activa = true AND es_fondo_prevision = false;
            IF v_moneda_pago IS NULL THEN
                RAISE EXCEPTION '{"key": "error_wallet_not_operative", "params": {}}';
            END IF;

            v_wallet_key := v_billetera_id::text;
            v_dup := (v_seen_billeteras ? v_wallet_key);
            IF v_dup THEN
                RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
            END IF;
            v_seen_billeteras := v_seen_billeteras || jsonb_build_object(v_wallet_key, true);
        END IF;

        v_moneda_target := COALESCE(v_target, v_moneda_pago);
        IF v_moneda_target NOT IN (v_moneda_local, 'USD') THEN
            RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
        END IF;

        v_monto_target := v_monto;
        IF v_moneda_pago = v_moneda_local AND v_moneda_target = 'USD' THEN
            v_monto_target := v_monto / v_cotizacion_usd;
        ELSIF v_moneda_pago = 'USD' AND v_moneda_target = v_moneda_local THEN
            v_monto_target := v_monto * v_cotizacion_usd;
        ELSIF v_moneda_pago != v_moneda_target THEN
            RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
        END IF;

        v_total_pagado := v_total_pagado + v_monto;

        IF v_billetera_id IS NOT NULL AND v_monto > v_saldo_billetera + 0.009 THEN
            RAISE EXCEPTION '{"key": "error_wallet_saldo_insuficiente", "params": {}}';
        END IF;

        IF v_billetera_id IS NULL THEN
            IF v_moneda_pago = v_moneda_local THEN
                v_total_favor_ars := v_total_favor_ars + v_monto;
            ELSE
                v_total_favor_usd := v_total_favor_usd + v_monto;
            END IF;
        END IF;

        v_pagos_aplicados := v_pagos_aplicados || jsonb_build_object(
            'monto_origen', v_monto,
            'moneda_origen', v_moneda_pago,
            'monto_target', v_monto_target,
            'moneda_target', v_moneda_target,
            'recargo_aplicado', false,
            'billetera_id', v_billetera_id
        );
    END LOOP;

    -- Permitir array vacÃÂ­o SOLO si hay saldo a favor (Bug 6).
    IF v_total_pagado = 0 AND jsonb_array_length(p_pagos) > 0 THEN
        RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
    END IF;
    IF v_total_pagado = 0 AND v_saldo_favor_inicial_ars <= 0 AND v_saldo_favor_inicial_usd <= 0 THEN
        RAISE EXCEPTION '{"key": "error_pagos_multi_invalido", "params": {}}';
    END IF;

    -- Calcular el total del ciclo actual (necesario para Bug 6 cuando p_pagos vacÃÂ­o).
    SELECT
        COALESCE(SUM(CASE WHEN moneda = v_moneda_local THEN monto_cuota ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN monto_cuota ELSE 0 END), 0)
      INTO v_total_mes_calculado_ars, v_total_mes_calculado_usd
      FROM p_cuotas_detalle
      WHERE tarjeta_id = p_tarjeta_id AND pagado = false
        AND (v_objetivo_desde IS NULL OR fecha_estimada_pago >= v_objetivo_desde)
        AND (v_objetivo_hasta IS NULL OR fecha_estimada_pago <= v_objetivo_hasta);

    -- Bug 6: si p_pagos vacÃÂ­o y hay saldo a favor, crear fila raÃÂ­z en p_caja
    -- ANTES del LOOP para que el LOOP no la pise. Pero el LOOP resetea.
    -- SoluciÃÂ³n: el INSERT raÃÂ­z va DESPUÃâ°S del LOOP, solo si v_primer_caja_id quedÃÂ³ NULL.

    IF v_total_favor_ars > 0 THEN
        UPDATE p_tarjetas_credito
          SET saldo_a_favor = COALESCE(saldo_a_favor, 0) - v_total_favor_ars
          WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
    END IF;
    IF v_total_favor_usd > 0 THEN
        UPDATE p_tarjetas_credito
          SET saldo_a_favor_usd = COALESCE(saldo_a_favor_usd, 0) - v_total_favor_usd
          WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
    END IF;

    -- INSERT en p_caja: una fila por lÃÂ­nea, con parent_pago_caja_id apuntando al root.
    v_primer_caja_id := NULL;
    FOR v_pago IN
        SELECT jsonb_array_elements(v_pagos_aplicados)
    LOOP
        v_billetera_id := NULLIF(v_pago->>'billetera_id', '')::bigint;
        v_monto := (v_pago->>'monto_origen')::numeric;
        v_moneda_pago := v_pago->>'moneda_origen';

        IF v_primer_caja_id IS NULL THEN
            IF v_billetera_id IS NULL THEN
                INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id, moneda, parent_pago_caja_id, resumen_real)
                  VALUES (v_user_id, 'pago_tarjeta', NULL, v_monto, p_fecha_pago, 'card_summary_payment_favor', p_tarjeta_id, v_moneda_pago, NULL, p_resumen_real)
                  RETURNING p_caja_id INTO v_caja_id;
            ELSE
                INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id, moneda, parent_pago_caja_id, resumen_real)
                  VALUES (v_user_id, 'pago_tarjeta', v_billetera_id, v_monto, p_fecha_pago, 'card_summary_payment_multi', p_tarjeta_id, v_moneda_pago, NULL, p_resumen_real)
                  RETURNING p_caja_id INTO v_caja_id;
            END IF;
            v_primer_caja_id := v_caja_id;
        ELSE
            IF v_billetera_id IS NULL THEN
                INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id, moneda, parent_pago_caja_id, resumen_real)
                   VALUES (v_user_id, 'pago_tarjeta', NULL, v_monto, p_fecha_pago, 'card_summary_payment_split', p_tarjeta_id, v_moneda_pago, v_primer_caja_id, p_resumen_real);
            ELSE
                INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id, moneda, parent_pago_caja_id, resumen_real)
                  VALUES (v_user_id, 'pago_tarjeta', v_billetera_id, v_monto, p_fecha_pago, 'card_summary_payment_split', p_tarjeta_id, v_moneda_pago, v_primer_caja_id, p_resumen_real);
            END IF;
        END IF;
    END LOOP;

    -- Bug 6: si p_pagos vacÃÂ­o y no se creÃÂ³ fila raÃÂ­z, crear una aquÃÂ­
    -- (necesaria para p_pagos_tarjeta_log.p_caja_id NOT NULL).
    IF v_primer_caja_id IS NULL AND (v_saldo_favor_inicial_ars > 0 OR v_saldo_favor_inicial_usd > 0) THEN
        IF v_saldo_favor_inicial_ars > 0 THEN
            v_monto := LEAST(v_saldo_favor_inicial_ars, v_total_mes_calculado_ars + v_total_mes_calculado_usd * v_cotizacion_usd);
            v_moneda_pago := v_moneda_local;
        ELSE
            v_monto := LEAST(v_saldo_favor_inicial_usd, v_total_mes_calculado_usd + v_total_mes_calculado_ars / GREATEST(v_cotizacion_usd, 0.0001));
            v_moneda_pago := 'USD';
        END IF;
        INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id, moneda, resumen_real)
          VALUES (v_user_id, 'pago_tarjeta', NULL, GREATEST(v_monto, 0), p_fecha_pago, 'card_summary_payment_favor', p_tarjeta_id, v_moneda_pago, p_resumen_real)
          RETURNING p_caja_id INTO v_primer_caja_id;
    END IF;

    v_sobrante_total := fn_liquidar_ciclo_tarjeta_multi(
        p_tarjeta_id, v_user_id, p_fecha_pago, v_primer_caja_id,
        v_pagos_aplicados, v_cotizacion_usd, 0,
        v_objetivo_desde, v_objetivo_hasta
    );

    -- Fix resumen real 2026-09-15: cuando el banco debito mas que la ventana de
    -- cuotas de la app (p_resumen_real > liquidado), el objetivo de cubrimiento
    -- pasa a ser el resumen real declarado. El favor cubre la diferencia hasta
    -- donde alcance, igual que el gap-fill de la ventana; recien el excedente
    -- por ENCIMA del resumen real es sobrante acreditable.
    IF p_resumen_real IS NOT NULL AND p_resumen_real > 0.01 THEN
        -- Pozo puesto por el usuario: lineas de pago (monto_target) + gap-fill de
        -- favor (aporte del log). NO usar sobrante+liquidado: el sobrante se clampea
        -- a 0 cuando hay refinanciado y sobreestimaria lo cubierto.
        SELECT COALESCE(SUM((elem->>'monto_target')::numeric) FILTER (WHERE (elem->>'moneda_target') = v_moneda_local), 0)
             + COALESCE(SUM((elem->>'monto_target')::numeric) FILTER (WHERE (elem->>'moneda_target') = 'USD'), 0) * v_cotizacion_usd
          INTO v_cubierto_res
          FROM jsonb_array_elements(v_pagos_aplicados) AS jt(elem);
        SELECT v_cubierto_res + COALESCE(aporte_saldo, 0) + COALESCE(aporte_saldo_usd, 0) * v_cotizacion_usd
          INTO v_cubierto_res
          FROM p_pagos_tarjeta_log
         WHERE p_caja_id = v_primer_caja_id;
        DECLARE
            v_falta_banco numeric;
            v_tomar_ars_res numeric;
            v_tomar_usd_res numeric;
        BEGIN
            IF p_resumen_real > v_cubierto_res + 0.009 THEN
                v_falta_banco := p_resumen_real - v_cubierto_res;
                SELECT COALESCE(saldo_a_favor, 0), COALESCE(saldo_a_favor_usd, 0)
                  INTO v_saldo_favor_actual_ars, v_saldo_favor_actual_usd
                  FROM p_tarjetas_credito
                 WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
                v_tomar_ars_res := LEAST(v_saldo_favor_actual_ars, v_falta_banco);
                v_tomar_usd_res := 0;
                IF v_falta_banco > v_tomar_ars_res AND v_saldo_favor_actual_usd > 0 AND v_cotizacion_usd > 0 THEN
                    v_tomar_usd_res := LEAST(v_saldo_favor_actual_usd, (v_falta_banco - v_tomar_ars_res) / v_cotizacion_usd);
                END IF;
                IF v_tomar_ars_res > 0 THEN
                    UPDATE p_tarjetas_credito
                      SET saldo_a_favor = COALESCE(saldo_a_favor, 0) - v_tomar_ars_res
                      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
                END IF;
                IF COALESCE(v_tomar_usd_res, 0) > 0 THEN
                    UPDATE p_tarjetas_credito
                      SET saldo_a_favor_usd = COALESCE(saldo_a_favor_usd, 0) - v_tomar_usd_res
                      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
                END IF;
                v_favor_extra_res := v_tomar_ars_res + COALESCE(v_tomar_usd_res, 0) * v_cotizacion_usd;
                v_favor_acreditado := v_favor_acreditado - v_favor_extra_res;
            END IF;
        END;
    END IF;

    -- Sumar el saldo a favor disponible como respaldo para adelantar cuotas.
    -- El ciclo ARS/USD puede haberse liquidado sin consumir todo el favor previo,
    -- pero el favor sigue disponible para cancelar cuotas adelantadas.
    -- Coincide con el calculo del frontend (totalPagar + favorNum - cicloBruto).
    SELECT COALESCE(saldo_a_favor, 0), COALESCE(saldo_a_favor_usd, 0)
      INTO v_saldo_favor_actual_ars, v_saldo_favor_actual_usd
      FROM p_tarjetas_credito
      WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

    v_favor_disponible_equiv := v_saldo_favor_actual_ars
        + (v_saldo_favor_actual_usd * v_cotizacion_usd);

    -- Restaurar logica de adelantar cuotas: validar, liquidar y registrar en log.
    IF p_cuotas_adelantar IS NOT NULL AND array_length(p_cuotas_adelantar, 1) > 0 THEN
        IF EXISTS (
            SELECT 1
            FROM unnest(p_cuotas_adelantar) AS sel(cuota_id)
            LEFT JOIN p_cuotas_detalle cd
                   ON cd.cuota_id = sel.cuota_id
                  AND cd.user_id = v_user_id
                  AND cd.tarjeta_id = p_tarjeta_id
                  AND cd.pagado = false
            WHERE cd.cuota_id IS NULL
        ) THEN
            RAISE EXCEPTION '{"key": "error_cuota_adelanto_invalida", "params": {}}';
        END IF;

        FOR v_cuota_adelantada_id IN
            SELECT DISTINCT ON (cd.cuota_id) cd.cuota_id
              FROM unnest(p_cuotas_adelantar) AS sel(cuota_id)
              JOIN p_cuotas_detalle cd ON cd.cuota_id = sel.cuota_id
             WHERE cd.user_id = v_user_id
               AND cd.tarjeta_id = p_tarjeta_id
               AND cd.pagado = false
             ORDER BY cd.cuota_id, cd.fecha_estimada_pago ASC
        LOOP
            SELECT monto_cuota, moneda
              INTO v_cuota_adelantada_monto, v_cuota_adelantada_moneda
              FROM p_cuotas_detalle
             WHERE cuota_id = v_cuota_adelantada_id;

            IF v_cuota_adelantada_moneda = 'USD' THEN
                v_cuota_adelantada_monto := v_cuota_adelantada_monto * v_cotizacion_usd;
            END IF;

            IF v_cuota_adelantada_monto > v_sobrante_total + v_favor_disponible_equiv + 0.009 THEN
                RAISE EXCEPTION '{"key": "error_sobrante_insuficiente_cuota", "params": {}}';
            END IF;

            UPDATE p_cuotas_detalle
               SET pagado = true,
                   p_caja_id = v_primer_caja_id
             WHERE cuota_id = v_cuota_adelantada_id;

            v_sobrante_total := v_sobrante_total - v_cuota_adelantada_monto;

            IF v_cuota_adelantada_moneda = 'ARS' THEN
                v_total_adelantado_ars := v_total_adelantado_ars + v_cuota_adelantada_monto;
            ELSE
                v_total_adelantado_usd := v_total_adelantado_usd + (v_cuota_adelantada_monto / v_cotizacion_usd);
            END IF;

            v_cuotas_adelantadas_log := v_cuotas_adelantadas_log || jsonb_build_object(
                'cuota_id', v_cuota_adelantada_id,
                'monto', (SELECT monto_cuota FROM p_cuotas_detalle WHERE cuota_id = v_cuota_adelantada_id),
                'moneda', v_cuota_adelantada_moneda
            );
        END LOOP;

        IF v_total_adelantado_ars > 0 OR v_total_adelantado_usd > 0 THEN
            UPDATE p_pagos_tarjeta_log
               SET cuotas_adelantadas = v_cuotas_adelantadas_log,
                   total_adelantado_ars = v_total_adelantado_ars,
                   total_adelantado_usd = v_total_adelantado_usd
             WHERE p_caja_id = v_primer_caja_id;
        END IF;
    END IF;

    -- Debitar del saldo a favor lo que se consumio para adelantar cuotas
    -- (lo que excedio el sobrante del pago). v_sobrante_total quedo negativo
    -- porque el check incluyo el favor disponible y luego el LOOP decremento sin limite.
    IF v_sobrante_total < 0 AND (v_total_adelantado_ars > 0 OR v_total_adelantado_usd > 0) THEN
        v_deficit := -v_sobrante_total;
        v_tomar_ars := LEAST(v_saldo_favor_actual_ars, v_deficit);
        v_tomar_usd := 0;
        IF v_deficit > v_tomar_ars AND v_saldo_favor_actual_usd > 0 AND v_cotizacion_usd > 0 THEN
            v_tomar_usd := LEAST(v_saldo_favor_actual_usd, (v_deficit - v_tomar_ars) / v_cotizacion_usd);
        END IF;
        -- Trackear el debito de favor para que la reversion lo restaure.
        v_favor_acreditado := v_favor_acreditado - (v_tomar_ars + COALESCE(v_tomar_usd, 0) * v_cotizacion_usd);
        IF v_tomar_ars > 0 THEN
            UPDATE p_tarjetas_credito
              SET saldo_a_favor = COALESCE(saldo_a_favor, 0) - v_tomar_ars
              WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
        END IF;
        IF v_tomar_usd > 0 THEN
            UPDATE p_tarjetas_credito
              SET saldo_a_favor_usd = COALESCE(saldo_a_favor_usd, 0) - v_tomar_usd
              WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
        END IF;
        v_sobrante_total := 0;
    END IF;

    -- Sobrante remanente tras adelantar cuotas: acreditarlo a saldo_a_favor.
    -- Si p_monto_a_favor_explicito esta seteado, usar ESE monto (el front calculo
    -- el excedente real con su modelo de patrimonio vs resumen real / ciclo).
    -- Si no, comportamiento legacy: acreditar v_sobrante_total, salvo que el front
    -- haya pedido p_no_acreditar_favor = TRUE (caso Diferencia Tarjeta).
    IF p_resumen_real IS NOT NULL AND p_resumen_real > 0.01 AND NOT p_no_acreditar_favor THEN
        -- Con resumen real declarado, el unico excedente acreditable es lo pagado
        -- por ENCIMA del resumen del banco (pozo + aporte + favor extra - resumen
        -- real). Sin esto, pagar la diferencia del banco hoy acreditaba el sobrante
        -- de la ventana como favor y ademas registraba la Diferencia Tarjeta
        -- (doble conteo de la misma plata).
        DECLARE
            -- Fix 2026-10-28 (v2): con el tope por pool, la plata que entro y no se pudo
            -- aplicar a la ventana queda en v_sobrante_total. Esta rama calculaba el
            -- excedente contra el resumen del banco y no la miraba: la billetera se
            -- debitaba, las cuotas no se pagaban y el dinero no aparecia en ningun lado.
            -- Se acredita el mayor de los dos, para no contar dos veces el sobrante real.
            v_credito_res numeric := GREATEST(
                v_cubierto_res - p_resumen_real
                - (v_total_adelantado_ars + v_total_adelantado_usd * v_cotizacion_usd),
                v_sobrante_total,
                0);
        BEGIN
            IF v_credito_res > 0.01 THEN
                UPDATE p_tarjetas_credito
                  SET saldo_a_favor = COALESCE(saldo_a_favor, 0) + v_credito_res
                  WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
                v_favor_acreditado := v_favor_acreditado + v_credito_res;
            END IF;
        END;
    ELSIF p_monto_a_favor_explicito IS NOT NULL AND p_monto_a_favor_explicito > 0.01 THEN
        UPDATE p_tarjetas_credito
          SET saldo_a_favor = COALESCE(saldo_a_favor, 0) + p_monto_a_favor_explicito
          WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
        v_favor_acreditado := v_favor_acreditado + p_monto_a_favor_explicito;
    ELSIF v_sobrante_total > 0 AND NOT p_no_acreditar_favor THEN
        UPDATE p_tarjetas_credito
          SET saldo_a_favor = COALESCE(saldo_a_favor, 0) + v_sobrante_total
          WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;
        v_favor_acreditado := v_favor_acreditado + v_sobrante_total;
    END IF;

    -- Persistir el NETO de favor acreditado/debitado por este pago para que
    -- la reversion (fn_t_limpiar_dependencias_caja) lo descuenta exactamente.
    UPDATE p_pagos_tarjeta_log
       SET favor_acreditado = v_favor_acreditado
     WHERE p_caja_id = v_primer_caja_id;

    -- Trazabilidad: si el user declaro resumen real, comparar lo que el banco
    -- debito contra lo que la app cubrio realmente. Si la app cubrio menos,
    -- crear una Diferencia Tarjeta (gasto) por el delta, vinculada al pago
    -- raiz para que borrar el pago tambien borre la Diferencia.
    -- Excluir cuando p_no_acreditar_favor = TRUE (modo legacy donde el front
    -- ya crea el ajuste por su cuenta con fn_registrar_ajuste_diferencia_tarjeta).
    IF p_resumen_real IS NOT NULL AND v_primer_caja_id IS NOT NULL AND NOT p_no_acreditar_favor THEN
        DECLARE
            v_consumo_real_ars numeric := 0;
            v_diferencia_banco_ars numeric := 0;
            v_cat_card_diff_id bigint;
        BEGIN
            -- Leer del log lo que la app realmente cubrio del ciclo: liquidado (cuotas
            -- pagadas en el ciclo) + refinanciado (giro a proximo ciclo). Ambos en ARS
            -- equivalentes (refinanciado ya es suma ARS+USD*cotizacion).
            SELECT
                COALESCE(liquidado, 0)
                    + COALESCE(refinanciado_ars, 0)
                    + COALESCE(refinanciado_usd, 0) * v_cotizacion_usd
              INTO v_consumo_real_ars
              FROM p_pagos_tarjeta_log
             WHERE p_caja_id = v_primer_caja_id;

            -- Fix 2026-10-28 (v2): la deuda que quedo impaga en la ventana no es una
            -- "Diferencia Tarjeta". Sigue viva como cuota impaga, asi que contarla ademas
            -- como gasto era doble conteo de la misma plata. El delta del banco es lo que
            -- cobro por encima de (aplicado + lo que queda pendiente en la ventana).
            SELECT COALESCE(SUM(cd.monto_cuota), 0) INTO v_pendiente_ventana
              FROM p_cuotas_detalle cd
             WHERE cd.tarjeta_id = p_tarjeta_id AND cd.user_id = v_user_id
               AND cd.pagado = false
               AND (v_objetivo_desde IS NULL OR cd.fecha_estimada_pago >= v_objetivo_desde)
               AND (v_objetivo_hasta IS NULL OR cd.fecha_estimada_pago <= v_objetivo_hasta);

            v_diferencia_banco_ars := p_resumen_real - v_consumo_real_ars - v_pendiente_ventana;

            -- Si el banco debito mas de lo que la app cubrio, registrar Diferencia Tarjeta
            -- como gasto en la cuenta de sistema 'Diferencia Tarjeta' (cat_card_diff).
            IF v_diferencia_banco_ars > 0.01 THEN
                SELECT estructura_id INTO v_cat_card_diff_id
                  FROM p_estructuras_egresos
                 WHERE user_id = v_user_id AND nombre_cuenta = 'cat_card_diff'
                 LIMIT 1;

                -- Fix 2026-09-15: auto-crear la cuenta de sistema si no existe
                -- (misma convencion que fn_registrar_ajuste_diferencia_tarjeta).
                -- Sin esto, usuarios sin la estructura saltaban el ajuste en silencio.
                IF v_cat_card_diff_id IS NULL THEN
                    INSERT INTO p_estructuras_egresos (user_id, nombre_cuenta, tipo_cupo, descripcion, icono, color)
                    VALUES (v_user_id, 'cat_card_diff', 'need',
                            'Diferencias entre resumen de tarjeta y valor del banco', '💳', '#8B5CF6')
                    RETURNING estructura_id INTO v_cat_card_diff_id;
                END IF;

                IF v_cat_card_diff_id IS NOT NULL THEN
                    INSERT INTO p_caja (
                        user_id, tipo, billetera_origen_id, valor_egreso, fecha,
                        detalle, tarjeta_id, estructura_egreso_id, moneda,
                        parent_pago_caja_id, resumen_real
                    ) VALUES (
                        v_user_id, 'adjustment', NULL, v_diferencia_banco_ars, p_fecha_pago,
                        'adjustment_card_diff', p_tarjeta_id, v_cat_card_diff_id, 'ARS',
                        v_primer_caja_id, p_resumen_real
                    );
                END IF;
            END IF;
        END;
    END IF;

    RETURN v_primer_caja_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_liquidar_ciclo_tarjeta_multi(p_tarjeta_id bigint, p_user_id bigint, p_fecha_pago date, p_pago_caja_id bigint, p_pagos_aplicados jsonb, p_cotizacion_usd numeric, p_recargo_dolar_pct numeric, p_cuotas_desde date DEFAULT NULL::date, p_cuotas_hasta date DEFAULT NULL::date)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$


DECLARE
    v_moneda_local text;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_mes_actual date := date_trunc('month', p_fecha_pago);
    v_fin_ciclo_actual date;
    v_vencimiento_ciclo_actual date;
    v_min_fecha date;
    v_prox_vencimiento date;
    v_mes_periodo date;
    v_saldo_favor_ars numeric := 0;
    v_saldo_favor_usd numeric := 0;
    v_pool_ars numeric := 0;
    v_pool_usd numeric := 0;
    v_total_mes_ars numeric := 0;
    v_total_mes_usd numeric := 0;
    v_aporte_saldo_ars numeric := 0;
    v_aporte_saldo_usd numeric := 0;
    v_sobrante_ars numeric := 0;
    v_sobrante_usd numeric := 0;
    v_refinanciado_ars numeric := 0;
    v_refinanciado_usd numeric := 0;
    v_cuotas_ids_ars bigint[] := '{}';
    v_cuotas_ids_usd bigint[] := '{}';
    v_cuota_refi_ars_id bigint;
    v_cuota_refi_usd_id bigint;
    v_total_pagado_gross numeric := 0;
    r_cuota RECORD;
    v_pago jsonb;
    v_sobrante_total numeric := 0;
    v_corte_ars boolean := false;
    v_corte_usd boolean := false;
    v_ancla int;
    v_hay_cfg boolean := false;
BEGIN

    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = p_user_id), 'ARS') INTO v_moneda_local;
    SELECT dia_cierre, dia_vencimiento, COALESCE(saldo_a_favor, 0), COALESCE(saldo_a_favor_usd, 0)
      INTO v_dia_cierre, v_dia_vencimiento, v_saldo_favor_ars, v_saldo_favor_usd
      FROM p_tarjetas_credito
      WHERE tarjeta_id = p_tarjeta_id;

    -- Fix 2026-10-28 (v2): una sola lectura del ancla de ciclo (antes se consultaba
    -- p_presupuestos_config una vez por cuota pagada).
    SELECT dia_ancla_ciclo,
           true
      INTO v_ancla, v_hay_cfg
      FROM p_presupuestos_config WHERE user_id = p_user_id;
    v_ancla := COALESCE(v_ancla, 1);

    v_dia_cierre := COALESCE(v_dia_cierre, 20);
    v_dia_vencimiento := COALESCE(v_dia_vencimiento, 10);

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

    SELECT
        COALESCE(SUM((elem->>'monto_target')::numeric) FILTER (WHERE (elem->>'moneda_target') = v_moneda_local), 0),
        COALESCE(SUM((elem->>'monto_target')::numeric) FILTER (WHERE (elem->>'moneda_target') = 'USD'), 0)
      INTO v_pool_ars, v_pool_usd
      FROM jsonb_array_elements(p_pagos_aplicados) AS x(elem);

    FOR r_cuota IN
        SELECT cuota_id, monto_cuota, fecha_estimada_pago, moneda
          FROM p_cuotas_detalle
          WHERE tarjeta_id = p_tarjeta_id
            AND pagado = false
            -- Ventana explicita (p_objetivo) reemplaza el tope legacy del ciclo;
            -- sin ventana, se mantiene el comportamiento original.
            AND (p_cuotas_desde IS NOT NULL OR date_trunc('month', fecha_estimada_pago) <= date_trunc('month', v_vencimiento_ciclo_actual))
            AND (p_cuotas_desde IS NULL OR fecha_estimada_pago >= p_cuotas_desde)
            AND (p_cuotas_hasta IS NULL OR fecha_estimada_pago <= p_cuotas_hasta)
          -- Fix 2026-10-28 (v2): desempate explicito. Todas las cuotas de un mismo
          -- resumen comparten fecha_estimada_pago, asi que sin esto el subconjunto que
          -- se paga al alcanzar justo el pool no era reproducible.
          ORDER BY fecha_estimada_pago ASC, cuota_id ASC
    LOOP
        -- Fix 2026-10-28: en modo objetivo (ventana explicita) la liquidacion se corta
        -- cuando se agota la plata disponible (pool pagado + saldo a favor). Antes se
        -- marcaban pagado = true TODAS las cuotas de la ventana y el faltante se
        -- refinanciaba a una cuota sintetica del ciclo siguiente: quedaban cuotas
        -- pagadas sin que nadie las pagara, desaparecian del reporte y despues el
        -- propio pago las rechazaba como adelanto (exige cd.pagado = false). Eso es el
        -- "no se pueden pagar" reportado. El remanente ahora queda impago, en su lugar.
        -- Fix 2026-10-28 (v2): FIFO estricto. Antes, cuando una cuota no entraba, se la
        -- salteaba y se seguia con las siguientes: se terminaba pagando la 1ra y la 3ra
        -- mientras la 2da (la mas cara) quedaba impaga. La deuda se extingue de la mas
        -- vieja a la mas nueva y en ese orden se corta; lo que no entra queda pendiente y
        -- el dinero sin aplicar se acredita a favor (no se pierde).
        IF p_cuotas_desde IS NOT NULL OR p_cuotas_hasta IS NOT NULL THEN
            IF r_cuota.moneda = v_moneda_local THEN
                IF v_corte_ars THEN
                    CONTINUE;
                END IF;
                IF v_total_mes_ars + r_cuota.monto_cuota > v_pool_ars + v_saldo_favor_ars + 0.009 THEN
                    v_corte_ars := true;
                    CONTINUE;
                END IF;
            ELSIF r_cuota.moneda = 'USD' THEN
                IF v_corte_usd THEN
                    CONTINUE;
                END IF;
                IF v_total_mes_usd + r_cuota.monto_cuota > v_pool_usd + v_saldo_favor_usd + 0.009 THEN
                    v_corte_usd := true;
                    CONTINUE;
                END IF;
            END IF;
        END IF;

        IF r_cuota.moneda = v_moneda_local THEN
            UPDATE p_cuotas_detalle
              SET pagado = true  -- fix 2026-09-15: conservar caja_id original (vinculo con la compra)
              WHERE cuota_id = r_cuota.cuota_id;
            v_total_mes_ars := v_total_mes_ars + r_cuota.monto_cuota;
            v_cuotas_ids_ars := array_append(v_cuotas_ids_ars, r_cuota.cuota_id);

            -- Fix 2026-10-28 (v2): el compromiso del mes se marca pagado SOLO cuando ya no
            -- queda ninguna cuota impaga de ese mes. Antes una sola cuota pagada cerraba el
            -- mes entero: el presupuesto decia "pagado" con deuda viva, que es el estado
            -- inconsistente reportado.
            v_mes_periodo := NULL;
            IF v_hay_cfg THEN
                v_mes_periodo := date_trunc('month',
                    CASE
                        WHEN EXTRACT(DAY FROM r_cuota.fecha_estimada_pago) >= v_ancla
                        THEN date_trunc('month', r_cuota.fecha_estimada_pago) + ((v_ancla - 1) * INTERVAL '1 day')
                        ELSE (date_trunc('month', r_cuota.fecha_estimada_pago) - INTERVAL '1 month') + ((v_ancla - 1) * INTERVAL '1 day')
                    END
                )::date;
            END IF;

            IF v_mes_periodo IS NOT NULL THEN
                UPDATE p_compromisos_tarjeta SET pagado = true
                  WHERE tarjeta_id = p_tarjeta_id AND user_id = p_user_id
                    AND mes_periodo = v_mes_periodo AND pagado = false
                    AND NOT EXISTS (
                        SELECT 1 FROM p_cuotas_detalle cd
                         WHERE cd.tarjeta_id = p_tarjeta_id AND cd.user_id = p_user_id
                           AND cd.pagado = false
                           AND date_trunc('month',
                                 CASE
                                     WHEN EXTRACT(DAY FROM cd.fecha_estimada_pago) >= v_ancla
                                     THEN date_trunc('month', cd.fecha_estimada_pago) + ((v_ancla - 1) * INTERVAL '1 day')
                                     ELSE (date_trunc('month', cd.fecha_estimada_pago) - INTERVAL '1 month') + ((v_ancla - 1) * INTERVAL '1 day')
                                 END
                               )::date = v_mes_periodo
                    );
            END IF;
        ELSIF r_cuota.moneda = 'USD' THEN
            UPDATE p_cuotas_detalle
              SET pagado = true  -- fix 2026-09-15: conservar caja_id original (vinculo con la compra)
              WHERE cuota_id = r_cuota.cuota_id;
            v_total_mes_usd := v_total_mes_usd + r_cuota.monto_cuota;
            v_cuotas_ids_usd := array_append(v_cuotas_ids_usd, r_cuota.cuota_id);

            -- Fix 2026-10-28 (v2): el compromiso del mes se marca pagado SOLO cuando ya no
            -- queda ninguna cuota impaga de ese mes. Antes una sola cuota pagada cerraba el
            -- mes entero: el presupuesto decia "pagado" con deuda viva, que es el estado
            -- inconsistente reportado.
            v_mes_periodo := NULL;
            IF v_hay_cfg THEN
                v_mes_periodo := date_trunc('month',
                    CASE
                        WHEN EXTRACT(DAY FROM r_cuota.fecha_estimada_pago) >= v_ancla
                        THEN date_trunc('month', r_cuota.fecha_estimada_pago) + ((v_ancla - 1) * INTERVAL '1 day')
                        ELSE (date_trunc('month', r_cuota.fecha_estimada_pago) - INTERVAL '1 month') + ((v_ancla - 1) * INTERVAL '1 day')
                    END
                )::date;
            END IF;

            IF v_mes_periodo IS NOT NULL THEN
                UPDATE p_compromisos_tarjeta SET pagado = true
                  WHERE tarjeta_id = p_tarjeta_id AND user_id = p_user_id
                    AND mes_periodo = v_mes_periodo AND pagado = false
                    AND NOT EXISTS (
                        SELECT 1 FROM p_cuotas_detalle cd
                         WHERE cd.tarjeta_id = p_tarjeta_id AND cd.user_id = p_user_id
                           AND cd.pagado = false
                           AND date_trunc('month',
                                 CASE
                                     WHEN EXTRACT(DAY FROM cd.fecha_estimada_pago) >= v_ancla
                                     THEN date_trunc('month', cd.fecha_estimada_pago) + ((v_ancla - 1) * INTERVAL '1 day')
                                     ELSE (date_trunc('month', cd.fecha_estimada_pago) - INTERVAL '1 month') + ((v_ancla - 1) * INTERVAL '1 day')
                                 END
                               )::date = v_mes_periodo
                    );
            END IF;
        END IF;
    END LOOP;

    -- Auto-aporte desde saldo_a_favor: cuando el pool de billeteras + favor explÃÂ­cito no alcanza.
    -- El RPC principal ya debitÃÂ³ el favor explÃÂ­cito; el helper puede aportar ADEMÃÂS desde
    -- saldo_a_favor si queda shortfall.
    IF v_total_mes_ars > 0 AND v_saldo_favor_ars > 0 THEN
        -- Gap fix 2026-09-15: el aporte llena SOLO la diferencia que falta
        -- (total - pool). Si el pool ya cubre el ciclo, el favor no se consume.
        v_aporte_saldo_ars := LEAST(v_saldo_favor_ars, GREATEST(v_total_mes_ars - v_pool_ars, 0));
        UPDATE p_tarjetas_credito
          SET saldo_a_favor = COALESCE(saldo_a_favor, 0) - v_aporte_saldo_ars
          WHERE tarjeta_id = p_tarjeta_id;
        v_pool_ars := v_pool_ars + v_aporte_saldo_ars;
    END IF;

    IF v_total_mes_usd > 0 AND v_saldo_favor_usd > 0 THEN
        v_aporte_saldo_usd := LEAST(v_saldo_favor_usd, GREATEST(v_total_mes_usd - v_pool_usd, 0));
        UPDATE p_tarjetas_credito
          SET saldo_a_favor_usd = COALESCE(saldo_a_favor_usd, 0) - v_aporte_saldo_usd
          WHERE tarjeta_id = p_tarjeta_id;
        v_pool_usd := v_pool_usd + v_aporte_saldo_usd;
    END IF;

    v_sobrante_ars := GREATEST(v_pool_ars - v_total_mes_ars, 0);
    v_sobrante_usd := GREATEST(v_pool_usd - v_total_mes_usd, 0);
    v_refinanciado_ars := GREATEST(v_total_mes_ars - v_pool_ars, 0);
    v_refinanciado_usd := GREATEST(v_total_mes_usd - v_pool_usd, 0);

    IF v_refinanciado_ars > 0 THEN
        IF v_dia_vencimiento <= v_dia_cierre THEN
            v_prox_vencimiento := (date_trunc('month', v_fin_ciclo_actual + INTERVAL '1 month') + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        ELSE
            v_prox_vencimiento := date_trunc('month', v_fin_ciclo_actual + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        END IF;

        INSERT INTO p_cuotas_detalle (user_id, tarjeta_id, numero_cuota, monto_cuota, moneda, fecha_estimada_pago, pagado)
          VALUES (p_user_id, p_tarjeta_id, 1, v_refinanciado_ars, v_moneda_local, v_prox_vencimiento, false)
          RETURNING cuota_id INTO v_cuota_refi_ars_id;

        SELECT date_trunc('month',
            CASE
                WHEN EXTRACT(DAY FROM v_prox_vencimiento) >= COALESCE(cfg.dia_ancla_ciclo, 1)
                THEN date_trunc('month', v_prox_vencimiento) + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                ELSE (date_trunc('month', v_prox_vencimiento) - INTERVAL '1 month') + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
            END
        )::date INTO v_mes_periodo
          FROM p_presupuestos_config cfg WHERE cfg.user_id = p_user_id;

        IF v_mes_periodo IS NULL THEN v_mes_periodo := date_trunc('month', v_prox_vencimiento)::date; END IF;

        INSERT INTO p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
          VALUES (p_tarjeta_id, p_user_id, v_refinanciado_ars, v_mes_periodo)
          ON CONFLICT (tarjeta_id, mes_periodo, user_id)
          DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
    END IF;

    IF v_refinanciado_usd > 0 THEN
        IF v_dia_vencimiento <= v_dia_cierre THEN
            v_prox_vencimiento := (date_trunc('month', v_fin_ciclo_actual + INTERVAL '1 month') + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        ELSE
            v_prox_vencimiento := date_trunc('month', v_fin_ciclo_actual + INTERVAL '1 month') + ((v_dia_vencimiento - 1) * INTERVAL '1 day');
        END IF;

        INSERT INTO p_cuotas_detalle (user_id, tarjeta_id, numero_cuota, monto_cuota, moneda, fecha_estimada_pago, pagado)
          VALUES (p_user_id, p_tarjeta_id, 1, v_refinanciado_usd, 'USD', v_prox_vencimiento, false)
          RETURNING cuota_id INTO v_cuota_refi_usd_id;

        SELECT date_trunc('month',
            CASE
                WHEN EXTRACT(DAY FROM v_prox_vencimiento) >= COALESCE(cfg.dia_ancla_ciclo, 1)
                THEN date_trunc('month', v_prox_vencimiento) + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                ELSE (date_trunc('month', v_prox_vencimiento) - INTERVAL '1 month') + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
            END
        )::date INTO v_mes_periodo
          FROM p_presupuestos_config cfg WHERE cfg.user_id = p_user_id;

        IF v_mes_periodo IS NULL THEN v_mes_periodo := date_trunc('month', v_prox_vencimiento)::date; END IF;

        INSERT INTO p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
          VALUES (p_tarjeta_id, p_user_id, v_refinanciado_usd, v_mes_periodo)
          ON CONFLICT (tarjeta_id, mes_periodo, user_id)
          DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
    END IF;

    -- Fix 2026-09-15: la acreditacion del sobrante a saldo_a_favor se hace UNA UNICA
-- VEZ en fn_registrar_pago_tarjeta_multi (al final, ya resuelto el adelanto de
-- cuotas). El credito interno que existia aqui duplicaba el sobrante y creaba
-- saldo a favor de la nada (bug de doble acreditacion detectado en tests).

    -- v_sobrante_total representa el excedente total (sumando ARS y USD convertido)
-- que el pago dejó libre para aplazar cuotas o devolver a billetera. Siempre es
-- positivo en esta fase; se devuelve tal cual (no se aplica el filtro de favor
-- explícito, eliminado en bugfix 2026-09-14 porque bloqueaba wallet-only overpayments).
v_sobrante_total := v_sobrante_ars + (v_sobrante_usd * p_cotizacion_usd);

    v_total_pagado_gross := (SELECT COALESCE(SUM((elem->>'monto_origen')::numeric), 0)
        FROM jsonb_array_elements(p_pagos_aplicados) AS arr(elem)
        WHERE (elem->>'moneda_origen') = v_moneda_local)
        + ((SELECT COALESCE(SUM((elem->>'monto_origen')::numeric), 0)
            FROM jsonb_array_elements(p_pagos_aplicados) AS arr(elem)
            WHERE (elem->>'moneda_origen') = 'USD') * p_cotizacion_usd);

    -- Audit log con campos per-moneda (Fase 5)
    INSERT INTO p_pagos_tarjeta_log (
        p_caja_id, user_id, tarjeta_id, monto_total,
        monto_total_ars, monto_total_usd,
        liquidado, aporte_saldo, refinanciado,
        cotizacion_usd, recargo_dolar_pct, pagos_aplicados,
        cuota_refi_id, cuotas_ids,
        aporte_saldo_usd, refinanciado_ars, refinanciado_usd,
        cuota_refi_id_ars, cuota_refi_id_usd
    ) VALUES (
        p_pago_caja_id, p_user_id, p_tarjeta_id,
        v_total_pagado_gross,
        v_total_mes_ars, v_total_mes_usd,
        v_total_mes_ars,
        v_aporte_saldo_ars,
        (v_refinanciado_ars + v_refinanciado_usd),
        p_cotizacion_usd, p_recargo_dolar_pct, p_pagos_aplicados,
        COALESCE(v_cuota_refi_ars_id, v_cuota_refi_usd_id),
        v_cuotas_ids_ars || v_cuotas_ids_usd,
        v_aporte_saldo_usd,
        v_refinanciado_ars,
        v_refinanciado_usd,
        v_cuota_refi_ars_id,
        v_cuota_refi_usd_id
    )
    ON CONFLICT (p_caja_id) DO UPDATE SET
        monto_total = EXCLUDED.monto_total,
        monto_total_ars = EXCLUDED.monto_total_ars,
        monto_total_usd = EXCLUDED.monto_total_usd,
        liquidado = EXCLUDED.liquidado,
        aporte_saldo = EXCLUDED.aporte_saldo,
        refinanciado = EXCLUDED.refinanciado,
        cotizacion_usd = EXCLUDED.cotizacion_usd,
        recargo_dolar_pct = EXCLUDED.recargo_dolar_pct,
        pagos_aplicados = EXCLUDED.pagos_aplicados,
        cuota_refi_id = EXCLUDED.cuota_refi_id,
        cuotas_ids = EXCLUDED.cuotas_ids,
        aporte_saldo_usd = EXCLUDED.aporte_saldo_usd,
        refinanciado_ars = EXCLUDED.refinanciado_ars,
        refinanciado_usd = EXCLUDED.refinanciado_usd,
        cuota_refi_id_ars = EXCLUDED.cuota_refi_id_ars,
        cuota_refi_id_usd = EXCLUDED.cuota_refi_id_usd;

    RETURN v_sobrante_total;
END;
$function$;
