CREATE OR REPLACE FUNCTION public.fn_liquidar_ciclo_tarjeta(p_tarjeta_id bigint, p_user_id bigint, p_fecha_pago date, p_monto_total numeric, p_pago_caja_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_total_mes_pendiente numeric := 0;
    v_monto_efectivo numeric := 0;
    v_saldo_favor numeric := 0;
    v_aporte_saldo numeric := 0;
    v_diferencia_refinanciada numeric := 0;
    v_fin_ciclo_actual date;
    v_dia_cierre_tarjeta int;
    v_dia_vencimiento_tarjeta int;
    v_vencimiento_ciclo_actual date;
    v_prox_vencimiento date;
    v_mes_actual date := date_trunc('month', p_fecha_pago);
    v_min_fecha date;
    r_cuota RECORD;
    v_mes_periodo date;
    v_cuotas_ids bigint[] := '{}';
    v_cuota_refi_id bigint;
    v_caja_id_log bigint := p_pago_caja_id;
BEGIN
    SELECT dia_cierre, dia_vencimiento INTO v_dia_cierre_tarjeta, v_dia_vencimiento_tarjeta
    FROM p_tarjetas_credito
    WHERE tarjeta_id = p_tarjeta_id;

    IF v_dia_cierre_tarjeta IS NULL OR v_dia_vencimiento_tarjeta IS NULL THEN
        v_dia_cierre_tarjeta := 20;
        v_dia_vencimiento_tarjeta := 10;
    END IF;

    IF v_dia_vencimiento_tarjeta > v_dia_cierre_tarjeta THEN
        IF EXTRACT(DAY FROM p_fecha_pago) <= v_dia_cierre_tarjeta THEN
            v_fin_ciclo_actual := v_mes_actual + ((v_dia_cierre_tarjeta - 1) * INTERVAL '1 day');
        ELSE
            v_fin_ciclo_actual := (v_mes_actual + INTERVAL '1 month') + ((v_dia_cierre_tarjeta - 1) * INTERVAL '1 day');
        END IF;
    ELSE
        IF EXTRACT(DAY FROM p_fecha_pago) <= v_dia_cierre_tarjeta THEN
            v_fin_ciclo_actual := (v_mes_actual - INTERVAL '1 month') + ((v_dia_cierre_tarjeta - 1) * INTERVAL '1 day');
        ELSE
            v_fin_ciclo_actual := v_mes_actual + ((v_dia_cierre_tarjeta - 1) * INTERVAL '1 day');
        END IF;
    END IF;

    IF v_dia_vencimiento_tarjeta <= v_dia_cierre_tarjeta THEN
        v_vencimiento_ciclo_actual := (date_trunc('month', v_fin_ciclo_actual) + INTERVAL '1 month') + ((v_dia_vencimiento_tarjeta - 1) * INTERVAL '1 day');
    ELSE
        v_vencimiento_ciclo_actual := date_trunc('month', v_fin_ciclo_actual) + ((v_dia_vencimiento_tarjeta - 1) * INTERVAL '1 day');
    END IF;

    SELECT MIN(fecha_estimada_pago) INTO v_min_fecha
    FROM p_cuotas_detalle
    WHERE tarjeta_id = p_tarjeta_id AND pagado = false;

    IF v_min_fecha IS NOT NULL AND v_min_fecha > v_vencimiento_ciclo_actual THEN
        v_vencimiento_ciclo_actual := v_min_fecha;
    END IF;

    FOR r_cuota IN
        SELECT cuota_id, monto_cuota, fecha_estimada_pago
        FROM p_cuotas_detalle
        WHERE tarjeta_id = p_tarjeta_id
          AND pagado = false
          AND date_trunc('month', fecha_estimada_pago) <= date_trunc('month', v_vencimiento_ciclo_actual)
        ORDER BY fecha_estimada_pago ASC
    LOOP
        v_total_mes_pendiente := v_total_mes_pendiente + r_cuota.monto_cuota;
        v_cuotas_ids := array_append(v_cuotas_ids, r_cuota.cuota_id);

        UPDATE p_cuotas_detalle
        SET pagado = true,
            p_caja_id = p_pago_caja_id
        WHERE cuota_id = r_cuota.cuota_id;

        UPDATE p_compromisos_tarjeta
        SET pagado = true
        WHERE tarjeta_id = p_tarjeta_id
          AND mes_periodo = (
                SELECT date_trunc('month',
                    CASE
                        WHEN EXTRACT(DAY FROM r_cuota.fecha_estimada_pago) >= COALESCE(cfg.dia_ancla_ciclo, 1)
                        THEN date_trunc('month', r_cuota.fecha_estimada_pago) + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                        ELSE (date_trunc('month', r_cuota.fecha_estimada_pago) - INTERVAL '1 month') + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                    END
                )::date
                FROM p_presupuestos_config cfg
                WHERE cfg.user_id = p_user_id
            )
            AND pagado = false;
    END LOOP;

    SELECT COALESCE(saldo_a_favor, 0) INTO v_saldo_favor
    FROM p_tarjetas_credito
    WHERE tarjeta_id = p_tarjeta_id;

    IF v_saldo_favor > 0 AND p_monto_total < v_total_mes_pendiente THEN
        v_aporte_saldo := LEAST(v_saldo_favor, v_total_mes_pendiente - p_monto_total);
        UPDATE p_tarjetas_credito
        SET saldo_a_favor = saldo_a_favor - v_aporte_saldo
        WHERE tarjeta_id = p_tarjeta_id;
    END IF;

    v_monto_efectivo := p_monto_total + v_aporte_saldo;

    IF v_monto_efectivo < v_total_mes_pendiente THEN
        v_diferencia_refinanciada := v_total_mes_pendiente - v_monto_efectivo;

        IF v_dia_vencimiento_tarjeta <= v_dia_cierre_tarjeta THEN
            v_prox_vencimiento := (date_trunc('month', v_fin_ciclo_actual + INTERVAL '1 month') + INTERVAL '1 month') + ((v_dia_vencimiento_tarjeta - 1) * INTERVAL '1 day');
        ELSE
            v_prox_vencimiento := date_trunc('month', v_fin_ciclo_actual + INTERVAL '1 month') + ((v_dia_vencimiento_tarjeta - 1) * INTERVAL '1 day');
        END IF;

        INSERT INTO p_cuotas_detalle (user_id, tarjeta_id, numero_cuota, monto_cuota, fecha_estimada_pago, pagado)
        VALUES (p_user_id, p_tarjeta_id, 1, v_diferencia_refinanciada, v_prox_vencimiento, false)
        RETURNING cuota_id INTO v_cuota_refi_id;

        SELECT date_trunc('month',
            CASE
                WHEN EXTRACT(DAY FROM v_prox_vencimiento) >= COALESCE(cfg.dia_ancla_ciclo, 1)
                THEN date_trunc('month', v_prox_vencimiento) + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                ELSE (date_trunc('month', v_prox_vencimiento) - INTERVAL '1 month') + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
            END
        )::date INTO v_mes_periodo
        FROM p_presupuestos_config cfg
        WHERE cfg.user_id = p_user_id;

        IF v_mes_periodo IS NULL THEN
            v_mes_periodo := date_trunc('month', v_prox_vencimiento)::date;
        END IF;

        INSERT INTO p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
        VALUES (p_tarjeta_id, p_user_id, v_diferencia_refinanciada, v_mes_periodo)
        ON CONFLICT (tarjeta_id, mes_periodo, user_id)
        DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
    END IF;

    -- AUDITORÃÂA: registrar el efecto exacto para reversiÃÂ³n
    INSERT INTO p_pagos_tarjeta_log (
        p_caja_id, user_id, tarjeta_id, monto_total,
        liquidado, aporte_saldo, refinanciado, cuota_refi_id, cuotas_ids
    ) VALUES (
        v_caja_id_log, p_user_id, p_tarjeta_id, p_monto_total,
        v_total_mes_pendiente, v_aporte_saldo, v_diferencia_refinanciada, v_cuota_refi_id, v_cuotas_ids
    ) ON CONFLICT (p_caja_id) DO UPDATE SET
        monto_total = EXCLUDED.monto_total,
        liquidado = EXCLUDED.liquidado,
        aporte_saldo = EXCLUDED.aporte_saldo,
        refinanciado = EXCLUDED.refinanciado,
        cuota_refi_id = EXCLUDED.cuota_refi_id,
        cuotas_ids = EXCLUDED.cuotas_ids;
END;
$function$

