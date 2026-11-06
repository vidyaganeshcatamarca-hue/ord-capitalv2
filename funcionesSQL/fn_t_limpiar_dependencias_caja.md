CREATE OR REPLACE FUNCTION public.fn_t_limpiar_dependencias_caja()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_pago_caja_id bigint;
    v_tarjeta_id bigint;
    v_aporte_ars numeric;
    v_aporte_usd numeric;
    v_refi_ars numeric;
    v_refi_usd numeric;
    v_refi_id_ars bigint;
    v_refi_id_usd bigint;
    v_cuotas_ids bigint[];
    v_pagos_aplicados_revert jsonb;
    v_favor_acreditado numeric;
    v_cuotas_adelantadas jsonb;
    v_pago_elem jsonb;
BEGIN
    IF OLD.tipo = 'pago_tarjeta' AND OLD.parent_pago_caja_id IS NULL THEN
        v_pago_caja_id := OLD.p_caja_id;

        SELECT tarjeta_id,
               COALESCE(aporte_saldo, 0),
               COALESCE(aporte_saldo_usd, 0),
               COALESCE(refinanciado_ars, 0),
               COALESCE(refinanciado_usd, 0),
               cuota_refi_id_ars,
               cuota_refi_id_usd,
               COALESCE(cuotas_ids, '{}'),
               COALESCE(pagos_aplicados, '[]'::jsonb),
               COALESCE(favor_acreditado, 0),
               COALESCE(cuotas_adelantadas, '[]'::jsonb)
          INTO v_tarjeta_id,
               v_aporte_ars,
               v_aporte_usd,
               v_refi_ars,
               v_refi_usd,
               v_refi_id_ars,
               v_refi_id_usd,
               v_cuotas_ids,
               v_pagos_aplicados_revert,
               v_favor_acreditado,
               v_cuotas_adelantadas
          FROM p_pagos_tarjeta_log
          WHERE p_caja_id = v_pago_caja_id;

        IF FOUND THEN
            IF array_length(v_cuotas_ids, 1) > 0 THEN
                -- Fix 2026-09-15: conservar caja_id (vinculo con la compra original)
                -- para que las cuotas no pierdan su nombre al revertir.
                UPDATE p_cuotas_detalle
                SET pagado = false
                WHERE cuota_id = ANY(v_cuotas_ids);
            END IF;

            -- F-37: las cuotas ADELANTADAS vuelven a impagas. Antes el pago les pisaba
            -- p_caja_id y el DELETE del final las borraba: se perdia la cuota entera.
            IF jsonb_array_length(v_cuotas_adelantadas) > 0 THEN
                UPDATE p_cuotas_detalle cd
                   SET pagado = false, pago_caja_id = NULL
                 WHERE cd.cuota_id IN (
                       SELECT (elem->>'cuota_id')::bigint
                         FROM jsonb_array_elements(v_cuotas_adelantadas) AS x(elem)
                       );
            END IF;

            IF v_aporte_ars > 0 THEN
                UPDATE p_tarjetas_credito
                SET saldo_a_favor = COALESCE(saldo_a_favor, 0) + v_aporte_ars
                WHERE tarjeta_id = v_tarjeta_id;
            END IF;

            IF v_aporte_usd > 0 THEN
                UPDATE p_tarjetas_credito
                SET saldo_a_favor_usd = COALESCE(saldo_a_favor_usd, 0) + v_aporte_usd
                WHERE tarjeta_id = v_tarjeta_id;
            END IF;

            IF jsonb_typeof(v_pagos_aplicados_revert) = 'array' THEN
                UPDATE p_tarjetas_credito
                  SET saldo_a_favor_usd = COALESCE(saldo_a_favor_usd, 0) +
                      COALESCE((
                          SELECT SUM((elem->>'monto_origen')::numeric)
                          FROM jsonb_array_elements(v_pagos_aplicados_revert) AS jt(elem)
                          WHERE ((elem->>'billetera_id') IS NULL OR (elem->>'billetera_id') = '')
                            AND (elem->>'moneda_origen') = (elem->>'moneda_target')
                            AND (elem->>'moneda_origen') = 'USD'
                      ), 0)
                  WHERE tarjeta_id = v_tarjeta_id;

                UPDATE p_tarjetas_credito
                  SET saldo_a_favor = COALESCE(saldo_a_favor, 0) +
                      COALESCE((
                          SELECT SUM((elem->>'monto_origen')::numeric)
                          FROM jsonb_array_elements(v_pagos_aplicados_revert) AS jt(elem)
                          WHERE ((elem->>'billetera_id') IS NULL OR (elem->>'billetera_id') = '')
                            AND (elem->>'moneda_origen') = (elem->>'moneda_target')
                            AND (elem->>'moneda_origen') = 'ARS'
                      ), 0)
                  WHERE tarjeta_id = v_tarjeta_id;
            END IF;

                -- Fix 2026-09-15: descontar el NETO de favor que el pago acredito
                -- (sobrante / monto explicito - deficit por adelantadas). Sin esto,
                -- el saldo a favor quedaba inflado tras revertir.
                IF v_favor_acreditado <> 0 THEN
                    UPDATE p_tarjetas_credito
                      SET saldo_a_favor = COALESCE(saldo_a_favor, 0) - v_favor_acreditado
                      WHERE tarjeta_id = v_tarjeta_id;
                END IF;

            IF v_refi_id_ars IS NOT NULL AND v_refi_ars > 0 THEN
                UPDATE p_compromisos_tarjeta
                SET monto_cuota = GREATEST(monto_cuota - v_refi_ars, 0),
                    pagado = CASE WHEN (monto_cuota - v_refi_ars) <= 0 THEN true ELSE pagado END
                WHERE tarjeta_id = v_tarjeta_id AND user_id = OLD.user_id
                  AND mes_periodo = (
                    SELECT date_trunc('month', fecha_estimada_pago) FROM p_cuotas_detalle
                    WHERE cuota_id = v_refi_id_ars
                  );
                DELETE FROM p_cuotas_detalle WHERE cuota_id = v_refi_id_ars;
            END IF;

            IF v_refi_id_usd IS NOT NULL AND v_refi_usd > 0 THEN
                UPDATE p_compromisos_tarjeta
                SET monto_cuota = GREATEST(monto_cuota - v_refi_usd, 0),
                    pagado = CASE WHEN (monto_cuota - v_refi_usd) <= 0 THEN true ELSE pagado END
                WHERE tarjeta_id = v_tarjeta_id AND user_id = OLD.user_id
                  AND mes_periodo = (
                    SELECT date_trunc('month', fecha_estimada_pago) FROM p_cuotas_detalle
                    WHERE cuota_id = v_refi_id_usd
                  );
                DELETE FROM p_cuotas_detalle WHERE cuota_id = v_refi_id_usd;
            END IF;
        END IF;
    END IF;

    IF OLD.tarjeta_id IS NOT NULL THEN
        UPDATE p_compromisos_tarjeta pct
        SET monto_cuota = pct.monto_cuota - cd.monto_cuota
        FROM p_cuotas_detalle cd
        WHERE pct.tarjeta_id = OLD.tarjeta_id
          AND pct.user_id = OLD.user_id
          AND pct.mes_periodo = (
                SELECT date_trunc('month',
                    CASE
                        WHEN EXTRACT(DAY FROM cd.fecha_estimada_pago) >= COALESCE(cfg.dia_ancla_ciclo, 1)
                        THEN date_trunc('month', cd.fecha_estimada_pago) + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                        ELSE (date_trunc('month', cd.fecha_estimada_pago) - INTERVAL '1 month') + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                    END
                )::date
                FROM p_presupuestos_config cfg WHERE cfg.user_id = OLD.user_id
            )
          AND cd.p_caja_id = OLD.p_caja_id;

        DELETE FROM p_compromisos_tarjeta
        WHERE tarjeta_id = OLD.tarjeta_id
          AND user_id = OLD.user_id
          AND monto_cuota <= 0.01;
    END IF;

    DELETE FROM p_cuotas_detalle WHERE p_caja_id = OLD.p_caja_id;

    RETURN OLD;
END;
$function$
