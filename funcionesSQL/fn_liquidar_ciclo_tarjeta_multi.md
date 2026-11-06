CREATE OR REPLACE FUNCTION public.fn_liquidar_ciclo_tarjeta_multi(p_tarjeta_id bigint, p_user_id bigint, p_fecha_pago date, p_pago_caja_id bigint, p_pagos_aplicados jsonb, p_cotizacion_usd numeric, p_cuotas_desde date DEFAULT NULL::date, p_cuotas_hasta date DEFAULT NULL::date, p_no_refinanciar boolean DEFAULT false)
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
        -- 2026-10-31: el corte por falta de plata se elimino. Marcaba impaga la cuota
        -- que no entraba y salia del bucle, asi que un pago parcial del resumen no
        -- liquidaba NADA y el dinero terminaba como saldo a favor. Ahora el modo
        -- objetivo sigue el mismo camino que el legacy: marca las cuotas de la ventana,
        -- el saldo a favor cubre lo que puede y el faltante se refinancia en una cuota
        -- del ciclo siguiente. La ventana sigue decidiendo QUE resumen se paga.

        IF r_cuota.moneda = v_moneda_local THEN
            UPDATE p_cuotas_detalle
              SET pagado = true, pago_caja_id = p_pago_caja_id  -- fix 2026-09-15: conservar caja_id original; 2026-10-31: registrar el pago que la cerro
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
              SET pagado = true, pago_caja_id = p_pago_caja_id  -- fix 2026-09-15: conservar caja_id original; 2026-10-31: registrar el pago que la cerro
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
    -- H1 (2026-11-04, segunda vuelta por pedido del dueno): un resto MENOR A UNA UNIDAD
    -- no es deuda y no genera cuota. Dos casos reales: el redondeo del modal
    -- (34.333,33 contra una cuota de 34.333,333333 => 0,0033) y el pago corto por
    -- centavos (cuota de 20,50 pagada con 20 => 0,50). En los dos se absorbe el resto
    -- y la cuota queda saldada. Un faltante de una unidad o mas SI refinancia, por el
    -- importe exacto: no se inventa ni se perdona deuda real.
    v_refinanciado_ars := CASE WHEN v_total_mes_ars - v_pool_ars >= 1 THEN v_total_mes_ars - v_pool_ars ELSE 0 END;
    v_refinanciado_usd := CASE WHEN v_total_mes_usd - v_pool_usd >= 1 THEN v_total_mes_usd - v_pool_usd ELSE 0 END;

    -- B (2026-11-04, decision del dueno): cuando el usuario declara el resumen real del
    -- banco y lo paga, ese monto manda sobre lo que la app tenia registrado. Las cuotas
    -- del resumen se saldan enteras y el faltante NO se refinancia: pasarlo al ciclo
    -- siguiente dejaba al usuario debiendo plata que el banco nunca le cobro. La
    -- diferencia se corrige hacia abajo en fn_registrar_pago_tarjeta_multi.
    IF p_no_refinanciar THEN
        v_refinanciado_ars := 0;
        v_refinanciado_usd := 0;
    END IF;

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
        cotizacion_usd, pagos_aplicados,
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
        p_cotizacion_usd, p_pagos_aplicados,
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
$function$
