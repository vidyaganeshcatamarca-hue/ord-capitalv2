CREATE OR REPLACE FUNCTION public.fn_registrar_pago_tarjeta(p_tarjeta_id bigint, p_monto numeric, p_billetera_id bigint, p_fecha_pago date DEFAULT CURRENT_DATE, p_cuotas_adelantar bigint[] DEFAULT NULL::bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_caja_id bigint;
    v_liquidado_trigger numeric := 0;
    v_sobrante numeric := 0;
    v_mes_periodo date;
    r_cuota RECORD;
BEGIN
    -- Validar autenticaciÃÂ³n del usuario
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- Validar que la tarjeta existe, pertenece al usuario y estÃÂ¡ activa
    -- (hardening: el trigger consume saldo_a_favor filtrando solo por tarjeta_id)
    IF NOT EXISTS (
        SELECT 1 FROM p_tarjetas_credito
        WHERE tarjeta_id = p_tarjeta_id
          AND user_id = v_user_id
          AND activa = true
    ) THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_operative", "params": {}}';
    END IF;

    -- ValidaciÃÂ³n de monto (nueva: evita pagos negativos que corrompan el sobrante)
    IF p_monto IS NULL OR p_monto < 0 THEN
        RAISE EXCEPTION '{"key": "error_field_invalid", "params": {"field": "p_monto"}}';
    END IF;

    -- Validar que la billetera de origen pertenezca al usuario, estÃÂ© activa y no sea un fondo de previsiÃÂ³n
    IF NOT EXISTS (
        SELECT 1 FROM p_billeteras
        WHERE billetera_id = p_billetera_id
          AND user_id = v_user_id
          AND es_fondo_prevision = false
          AND activa = true
    ) THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_operative", "params": {}}';
    END IF;

    -- Validar la selecciÃÂ³n de cuotas a adelantar: cada ID debe ser una cuota
    -- impaga de ESTA tarjeta, perteneciente al usuario
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
    END IF;

    -- Asentar el pago en p_caja.
    -- El trigger fn_tr_procesar_pago_tarjeta liquida las cuotas del ciclo,
    -- marca compromisos, ajusta la billetera y CONSUME saldo_a_favor si hace falta.
    INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, detalle, tarjeta_id)
    VALUES (v_user_id, 'pago_tarjeta', p_billetera_id, p_monto, p_fecha_pago, 'card_summary_payment', p_tarjeta_id)
    RETURNING p_caja_id INTO v_caja_id;

    -- El trigger ya liquidÃÂ³ las cuotas del ciclo con este p_caja_id.
    -- Sobrante real de dinero = monto pagado - cuotas liquidadas por el trigger.
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_liquidado_trigger
    FROM p_cuotas_detalle
    WHERE p_caja_id = v_caja_id;

    v_sobrante := p_monto - v_liquidado_trigger;

    -- Si el usuario seleccionÃÂ³ cuotas a adelantar, el sobrante debe alcanzar
    -- para CADA cuota pendiente seleccionada (regla total, nunca parcial).
    -- Se valida SIEMPRE que haya selecciÃÂ³n, incluso con sobrante 0.
    IF p_cuotas_adelantar IS NOT NULL AND array_length(p_cuotas_adelantar, 1) > 0 THEN
        IF EXISTS (
            SELECT 1
            FROM unnest(p_cuotas_adelantar) AS sel(cuota_id)
            JOIN p_cuotas_detalle cd ON cd.cuota_id = sel.cuota_id
            WHERE cd.user_id = v_user_id
              AND cd.tarjeta_id = p_tarjeta_id
              AND cd.pagado = false
              AND cd.monto_cuota > v_sobrante
        ) THEN
            RAISE EXCEPTION '{"key": "error_sobrante_insuficiente_cuota", "params": {}}';
        END IF;
    END IF;

    IF v_sobrante > 0 THEN
        -- OpciÃÂ³n B: cancelar cuotas futuras COMPLETAS elegidas por el usuario.
        -- Si el trigger ya liquidÃÂ³ alguna seleccionada (era del ciclo actual),
        -- se omite: ya fue cubierta por el pago, no consume sobrante.
        IF p_cuotas_adelantar IS NOT NULL AND array_length(p_cuotas_adelantar, 1) > 0 THEN
            FOR r_cuota IN
                SELECT DISTINCT ON (cd.cuota_id)
                       cd.cuota_id, cd.monto_cuota, cd.fecha_estimada_pago
                FROM unnest(p_cuotas_adelantar) AS sel(cuota_id)
                JOIN p_cuotas_detalle cd ON cd.cuota_id = sel.cuota_id
                WHERE cd.user_id = v_user_id
                  AND cd.tarjeta_id = p_tarjeta_id
                  AND cd.pagado = false
                ORDER BY cd.cuota_id, cd.fecha_estimada_pago ASC
            LOOP
                -- Regla de negocio: la cuota futura se cancela TOTAL, no parcial
                IF v_sobrante < r_cuota.monto_cuota THEN
                    RAISE EXCEPTION '{"key": "error_sobrante_insuficiente_cuota", "params": {}}';
                END IF;

                UPDATE p_cuotas_detalle
                SET pagado = true,
                    p_caja_id = v_caja_id
                WHERE cuota_id = r_cuota.cuota_id;

                -- Reducir el compromiso presupuestario del mes correspondiente
                -- (decremento preciso; si llega a 0 se marca pagado)
                SELECT date_trunc('month',
                    CASE
                        WHEN EXTRACT(DAY FROM r_cuota.fecha_estimada_pago) >= COALESCE(cfg.dia_ancla_ciclo, 1)
                        THEN date_trunc('month', r_cuota.fecha_estimada_pago) + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                        ELSE (date_trunc('month', r_cuota.fecha_estimada_pago) - INTERVAL '1 month') + ((COALESCE(cfg.dia_ancla_ciclo, 1) - 1) * INTERVAL '1 day')
                    END
                )::date INTO v_mes_periodo
                FROM p_presupuestos_config cfg
                WHERE cfg.user_id = v_user_id;

                IF v_mes_periodo IS NULL THEN
                    v_mes_periodo := date_trunc('month', r_cuota.fecha_estimada_pago)::date;
                END IF;

                UPDATE p_compromisos_tarjeta
                SET monto_cuota = GREATEST(monto_cuota - r_cuota.monto_cuota, 0),
                    pagado = CASE WHEN (monto_cuota - r_cuota.monto_cuota) <= 0 THEN true ELSE pagado END
                WHERE tarjeta_id = p_tarjeta_id
                  AND user_id = v_user_id
                  AND mes_periodo = v_mes_periodo;

                v_sobrante := v_sobrante - r_cuota.monto_cuota;
            END LOOP;
        END IF;

        -- OpciÃÂ³n A / resto: todo lo no asignado queda para el prÃÂ³ximo resumen
        IF v_sobrante > 0 THEN
            UPDATE p_tarjetas_credito
            SET saldo_a_favor = COALESCE(saldo_a_favor, 0) + v_sobrante
            WHERE tarjeta_id = p_tarjeta_id
              AND user_id = v_user_id;
        END IF;
    END IF;
END;
$function$

