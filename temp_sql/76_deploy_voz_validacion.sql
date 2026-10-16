-- temp_sql/76_deploy_voz_validacion.sql
-- =====================================================================
-- T5/S20 - Validacion de la moneda declarada al aprobar cuarentena.
--   * fn_aprobar_cuarentena_v2: moneda declarada no-activa del usuario ->
--     error editable (la fila queda pendiente, nunca se pierde).
--   * Moneda activa pero distinta de la pata: tolerada (manda la pata).
--   * Caminos cubiertos: expense, income, transfer, card_expense (la
--     validacion corre UNA vez, antes de la ramificacion por tipo).
-- Ingesta voice ya libre (deploy 73); aqui solo se gatea la APROBACION.
-- Idempotente: DROP por firma EXACTA + CREATE OR REPLACE.
-- =====================================================================

DROP FUNCTION IF EXISTS public.fn_aprobar_cuarentena_v2(p_pendiente_id bigint);

CREATE OR REPLACE FUNCTION public.fn_aprobar_cuarentena_v2(p_pendiente_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_rec RECORD;
    v_caja_id bigint;
    v_caja_id_2 bigint;
    v_metadata jsonb;
    v_error_message text;
    v_saldo_actual numeric;
    v_wallet_nombre text;
    v_moneda text;
    v_moneda_2 text;
    v_trans_detalle text;
    v_dia_cierre int;
    v_dia_vencimiento int;
    v_dia_compra int;
    v_monto_cuota numeric;
    v_mes_compra date;
    v_base_date date;
    v_fecha_estimada date;
    v_mes_periodo date;
    v_i int;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT * INTO v_rec
    FROM public.p_caja_cuarentena
    WHERE pendiente_id = p_pendiente_id
      AND user_id = v_user_id
      AND estado = 'pendiente';

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_quarantine_item_not_found", "params": {}}';
    END IF;

    v_metadata := COALESCE(v_rec.metadata, '{}'::jsonb);
    v_metadata := jsonb_set(v_metadata, '{origen_cuarentena}', to_jsonb(v_rec.origen));
    v_metadata := jsonb_set(v_metadata, '{quarantine_id}', to_jsonb(v_rec.pendiente_id));

    -- S20 (monedas extra libres): la moneda DECLARADA del item (voz/OCR/ajuste)
    -- nunca se consultaba: el motor insertaba con la moneda de la pata y un
    -- "5 EUR" en una billetera ARS entraba silenciosamente como 5 ARS. Regla
    -- decidida con el dueno: si hay moneda declarada y NO es una de las monedas
    -- activas del usuario (local + extras efectivas), la aprobacion se rechaza
    -- con error EDITABLE -- la fila sigue 'pendiente' (nunca se pierde) y el
    -- usuario corrige moneda o billetera en el editor. Una moneda declarada
    -- ACTIVA pero distinta de la pata se tolera: el motor sigue insertando con
    -- la moneda real de la pata (la billetera que el usuario eligio manda).
    IF v_rec.moneda IS NOT NULL THEN
        DECLARE
            v_moneda_decl text := UPPER(TRIM(v_rec.moneda));
        BEGIN
            IF v_moneda_decl <> COALESCE(public.fn_get_default_currency(v_user_id), '')
               AND NOT EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements_text(public.fn_obtener_monedas_extra()) AS e(m)
                   WHERE e.m = v_moneda_decl
               ) THEN
                RAISE EXCEPTION '%', jsonb_build_object(
                    'key', 'error_cuarentena_moneda_no_activa',
                    'params', jsonb_build_object('moneda', v_moneda_decl))::text;
            END IF;
        END;
    END IF;

    IF v_rec.tipo IS NULL OR v_rec.tipo = 'expense' THEN
        IF v_rec.billetera_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "billetera_origen"}}';
        END IF;
        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;

        -- Wallet balance rule: the paying wallet must cover the amount. The
        -- row is locked to serialize concurrent approvals spending the same
        -- balance. income receives (no rule) and card_expense pays with
        -- credit (the card, not the wallet, is the constraint).
        SELECT b.saldo_actual, b.nombre, b.moneda
        INTO v_saldo_actual, v_wallet_nombre, v_moneda
        FROM public.p_billeteras b
        WHERE b.billetera_id = v_rec.billetera_id
          AND b.user_id = v_user_id
        FOR UPDATE;

        IF v_saldo_actual IS NULL THEN
            RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
        END IF;

        IF v_saldo_actual < v_rec.monto THEN
            RAISE EXCEPTION '{"key": "error_wallet_saldo_insuficiente", "params": {"nombre": "%", "saldo": %}}',
                v_wallet_nombre, v_saldo_actual;
        END IF;
        -- The stored amount is denominated in the SOURCE wallet currency: the
        -- movement currency must come from the wallet, never from whatever the
        -- interpreter recorded (the default would incorrectly say ARS).
        INSERT INTO public.p_caja (
            user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
            fecha, es_compartido, estructura_egreso_id, detalle, metadata,
            moneda, es_usd
        )
        VALUES (
            v_user_id, 'expense', v_rec.billetera_id, v_rec.monto, 0,
            v_rec.fecha, false, v_rec.estructura_egreso_id, v_rec.detalle, v_metadata,
            v_moneda, (v_moneda = 'USD')
        )
        RETURNING p_caja_id INTO v_caja_id;

    ELSIF v_rec.tipo = 'income' THEN
        IF v_rec.billetera_destino_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "billetera_destino"}}';
        END IF;
        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;

        SELECT b.moneda INTO v_moneda
        FROM public.p_billeteras b
        WHERE b.billetera_id = v_rec.billetera_destino_id
          AND b.user_id = v_user_id;

        INSERT INTO public.p_caja (
            user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso,
            fecha, es_compartido, cuenta_ingreso_id, detalle, metadata,
            moneda, es_usd
        )
        VALUES (
            v_user_id, 'income', v_rec.billetera_destino_id, v_rec.monto, 0,
            v_rec.fecha, false, v_rec.cuenta_ingreso_id, v_rec.detalle, v_metadata,
            v_moneda, (v_moneda = 'USD')
        )
        RETURNING p_caja_id INTO v_caja_id;

    ELSIF v_rec.tipo = 'transfer' THEN
        IF v_rec.billetera_id IS NULL OR v_rec.billetera_destino_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "billeteras_transfer"}}';
        END IF;
        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;

        -- Wallet balance rule: the paying wallet must cover the amount. The
        -- row is locked to serialize concurrent approvals spending the same
        -- balance. income receives (no rule) and card_expense pays with
        -- credit (the card, not the wallet, is the constraint).
        SELECT b.saldo_actual, b.nombre, b.moneda
        INTO v_saldo_actual, v_wallet_nombre, v_moneda
        FROM public.p_billeteras b
        WHERE b.billetera_id = v_rec.billetera_id
          AND b.user_id = v_user_id
        FOR UPDATE;

        IF v_saldo_actual IS NULL THEN
            RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
        END IF;

        IF v_saldo_actual < v_rec.monto THEN
            RAISE EXCEPTION '{"key": "error_wallet_saldo_insuficiente", "params": {"nombre": "%", "saldo": %}}',
                v_wallet_nombre, v_saldo_actual;
        END IF;
        SELECT b.moneda INTO v_moneda_2
        FROM public.p_billeteras b
        WHERE b.billetera_id = v_rec.billetera_destino_id
          AND b.user_id = v_user_id;
        BEGIN
            INSERT INTO public.p_caja (
                user_id, tipo, billetera_origen_id, billetera_destino_id,
                valor_egreso, valor_ingreso, fecha, detalle, metadata,
                moneda, es_usd
            )
            VALUES (
                v_user_id, 'transfer', v_rec.billetera_id, v_rec.billetera_destino_id,
                v_rec.monto, COALESCE(v_rec.destination_amount, v_rec.monto),
                v_rec.fecha, v_rec.detalle, v_metadata,
                v_moneda, (v_moneda = 'USD')
            )
            RETURNING p_caja_id INTO v_caja_id;

        EXCEPTION WHEN OTHERS THEN
            v_error_message := SQLERRM;
            IF v_error_message LIKE '%error_transfer_different_currencies%' THEN
                IF v_rec.destination_amount IS NULL OR v_rec.destination_amount <= 0 THEN
                    RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "destination_amount"}}';
                END IF;

                -- Cross-currency legs have no category: when the user did not
                -- write a note, each labeled leg carries an i18n key stating
                -- what the pair really was (buying or selling USD).
                v_trans_detalle := v_rec.detalle;
                IF (v_trans_detalle IS NULL OR v_trans_detalle = '') THEN
                    -- S17: titulo dinamico (helper; USD conserva keys legacy).
                    v_trans_detalle := public.fn_titulo_transferencia(
                        v_moneda, v_moneda_2,
                        COALESCE(public.fn_get_default_currency(v_user_id), ''));
                END IF;

                INSERT INTO public.p_caja (
                    user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
                    fecha, detalle, metadata, moneda, es_usd
                )
                VALUES (
                    v_user_id, 'expense', v_rec.billetera_id, v_rec.monto, 0,
                    v_rec.fecha, v_trans_detalle,
                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb),
                    v_moneda, (v_moneda = 'USD')
                )
                RETURNING p_caja_id INTO v_caja_id;

                INSERT INTO public.p_caja (
                    user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso,
                    fecha, detalle, metadata, moneda, es_usd
                )
                VALUES (
                    v_user_id, 'income', v_rec.billetera_destino_id, v_rec.destination_amount, 0,
                    v_rec.fecha, v_trans_detalle,
                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb),
                    v_moneda_2, (v_moneda_2 = 'USD')
                )
                RETURNING p_caja_id INTO v_caja_id_2;
            ELSE
                RAISE;
            END IF;
        END;

    ELSIF v_rec.tipo = 'card_expense' THEN
        IF v_rec.tarjeta_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "tarjeta"}}';
        END IF;
        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;

        SELECT tc.moneda_iso INTO v_moneda
        FROM public.p_tarjetas_credito tc
        WHERE tc.tarjeta_id = v_rec.tarjeta_id
          AND tc.user_id = v_user_id;

        INSERT INTO public.p_caja (
            user_id, tipo, tarjeta_id, valor_egreso, valor_ingreso,
            fecha, es_compartido, estructura_egreso_id, detalle, metadata,
            cuotas_totales, es_usd, moneda
        )
        VALUES (
            v_user_id, 'expense', v_rec.tarjeta_id, v_rec.monto, 0,
            v_rec.fecha, false, v_rec.estructura_egreso_id, v_rec.detalle, v_metadata,
            COALESCE(v_rec.cuotas, 1), (v_moneda = 'USD'), v_moneda
        )
        RETURNING p_caja_id INTO v_caja_id;

        -- Voice-approved card expenses must generate the same installment
        -- schedule the manual card flow generates (fn_registrar_gasto_tarjeta):
        -- one p_cuotas_detalle row per installment linked to the movement plus
        -- the monthly compromiso. Without them the purchase never appears in a
        -- card summary (bug 2026-10-13: voz movements had cuotas_totales but 0
        -- detalle rows).
        SELECT tc.dia_cierre, tc.dia_vencimiento
          INTO v_dia_cierre, v_dia_vencimiento
          FROM public.p_tarjetas_credito tc
          WHERE tc.tarjeta_id = v_rec.tarjeta_id;
        v_dia_compra := EXTRACT(DAY FROM v_rec.fecha)::int;
        v_monto_cuota := v_rec.monto / GREATEST(COALESCE(v_rec.cuotas, 1), 1);
        v_mes_compra := date_trunc('month', v_rec.fecha);
        IF v_dia_compra <= COALESCE(v_dia_cierre, v_dia_compra) THEN
            v_base_date := v_mes_compra;
        ELSE
            v_base_date := v_mes_compra + INTERVAL '1 month';
        END IF;
        IF COALESCE(v_dia_vencimiento, v_dia_compra) <= COALESCE(v_dia_cierre, v_dia_compra) THEN
            v_base_date := v_base_date + INTERVAL '1 month';
        END IF;
        FOR v_i IN 0..(GREATEST(COALESCE(v_rec.cuotas, 1), 1) - 1) LOOP
            v_fecha_estimada := (v_base_date + (v_i || ' months')::interval)
                + (COALESCE(v_dia_vencimiento, v_dia_compra) - 1) * INTERVAL '1 day';
            SELECT date_trunc('month', fecha_inicio)::date INTO v_mes_periodo
              FROM public.fn_obtener_fechas_ciclo_presupuesto(v_fecha_estimada);
            INSERT INTO public.p_cuotas_detalle (
                user_id, tarjeta_id, numero_cuota, monto_cuota, moneda,
                fecha_estimada_pago, pagado, p_caja_id
            ) VALUES (
                v_user_id, v_rec.tarjeta_id, v_i + 1, v_monto_cuota, v_moneda,
                v_fecha_estimada, false, v_caja_id
            );
            INSERT INTO public.p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
            VALUES (v_rec.tarjeta_id, v_user_id, v_monto_cuota, v_mes_periodo)
            ON CONFLICT (tarjeta_id, mes_periodo, user_id)
            DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
        END LOOP;

    ELSE
        RAISE EXCEPTION '{"key": "error_invalid_movement_type", "params": {}}';
    END IF;

    UPDATE public.p_caja_cuarentena
    SET estado = 'procesado'
    WHERE pendiente_id = p_pendiente_id;

    RETURN v_caja_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE public.p_caja_cuarentena
    SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{last_approve_error}',
        to_jsonb(SQLERRM)
    )
    WHERE pendiente_id = p_pendiente_id;
    RAISE;
END;
$function$;
