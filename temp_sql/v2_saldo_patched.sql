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
        SELECT b.saldo_actual, b.nombre
        INTO v_saldo_actual, v_wallet_nombre
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
        INSERT INTO public.p_caja (
            user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
            fecha, es_compartido, estructura_egreso_id, detalle, metadata
        )
        VALUES (
            v_user_id, 'expense', v_rec.billetera_id, v_rec.monto, 0,
            v_rec.fecha, false, v_rec.estructura_egreso_id, v_rec.detalle, v_metadata
        )
        RETURNING p_caja_id INTO v_caja_id;

    ELSIF v_rec.tipo = 'income' THEN
        IF v_rec.billetera_destino_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "billetera_destino"}}';
        END IF;
        IF v_rec.monto IS NULL OR v_rec.monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;

        INSERT INTO public.p_caja (
            user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso,
            fecha, es_compartido, cuenta_ingreso_id, detalle, metadata
        )
        VALUES (
            v_user_id, 'income', v_rec.billetera_destino_id, v_rec.monto, 0,
            v_rec.fecha, false, v_rec.cuenta_ingreso_id, v_rec.detalle, v_metadata
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
        SELECT b.saldo_actual, b.nombre
        INTO v_saldo_actual, v_wallet_nombre
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
        BEGIN
            INSERT INTO public.p_caja (
                user_id, tipo, billetera_origen_id, billetera_destino_id,
                valor_egreso, valor_ingreso, fecha, detalle, metadata
            )
            VALUES (
                v_user_id, 'transfer', v_rec.billetera_id, v_rec.billetera_destino_id,
                v_rec.monto, COALESCE(v_rec.destination_amount, v_rec.monto),
                v_rec.fecha, v_rec.detalle, v_metadata
            )
            RETURNING p_caja_id INTO v_caja_id;

        EXCEPTION WHEN OTHERS THEN
            v_error_message := SQLERRM;
            IF v_error_message LIKE '%error_transfer_different_currencies%' THEN
                IF v_rec.destination_amount IS NULL OR v_rec.destination_amount <= 0 THEN
                    RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "destination_amount"}}';
                END IF;

                INSERT INTO public.p_caja (
                    user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
                    fecha, detalle, metadata
                )
                VALUES (
                    v_user_id, 'expense', v_rec.billetera_id, v_rec.monto, 0,
                    v_rec.fecha, v_rec.detalle,
                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb)
                )
                RETURNING p_caja_id INTO v_caja_id;

                INSERT INTO public.p_caja (
                    user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso,
                    fecha, detalle, metadata
                )
                VALUES (
                    v_user_id, 'income', v_rec.billetera_destino_id, v_rec.destination_amount, 0,
                    v_rec.fecha, v_rec.detalle,
                    jsonb_set(v_metadata, '{transfer_double_insert}', 'true'::jsonb)
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

        INSERT INTO public.p_caja (
            user_id, tipo, tarjeta_id, valor_egreso, valor_ingreso,
            fecha, es_compartido, estructura_egreso_id, detalle, metadata,
            cuotas_totales, es_usd
        )
        VALUES (
            v_user_id, 'expense', v_rec.tarjeta_id, v_rec.monto, 0,
            v_rec.fecha, false, v_rec.estructura_egreso_id, v_rec.detalle, v_metadata,
            COALESCE(v_rec.cuotas, 1), (v_rec.moneda = 'USD')
        )
        RETURNING p_caja_id INTO v_caja_id;

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
$function$

CREATE OR REPLACE FUNCTION public.fn_aprobar_cuarentena_lote_v2(p_pendiente_ids bigint[])
 RETURNS TABLE(pendiente_id bigint, p_caja_id bigint, ok boolean, error_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_id bigint;
    v_caja_id bigint;
    v_error_key text;
    v_error_msg text;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_pendiente_ids IS NULL OR array_length(p_pendiente_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    FOREACH v_id IN ARRAY p_pendiente_ids
    LOOP
        v_caja_id := NULL;
        v_error_key := NULL;
        v_error_msg := NULL;

        BEGIN
            v_caja_id := public.fn_aprobar_cuarentena_v2(v_id);
            RETURN QUERY SELECT v_id, v_caja_id, true, NULL::text;
        EXCEPTION WHEN OTHERS THEN
            v_error_msg := SQLERRM;
            v_error_key := CASE
                WHEN v_error_msg LIKE '%error_field_required%' THEN 'error_field_required'
                WHEN v_error_msg LIKE '%error_invalid_amount%' THEN 'error_invalid_amount'
                WHEN v_error_msg LIKE '%error_invalid_movement_type%' THEN 'error_invalid_movement_type'
                WHEN v_error_msg LIKE '%error_quarantine_item_not_found%' THEN 'error_quarantine_item_not_found'
                WHEN v_error_msg LIKE '%error_transfer_different_currencies%' THEN 'error_transfer_different_currencies'
                WHEN v_error_msg LIKE '%error_transfer_insufficient_balance%' THEN 'error_transfer_insufficient_balance'
                WHEN v_error_msg LIKE '%error_wallet_not_found%' THEN 'error_wallet_not_found'
                WHEN v_error_msg LIKE '%error_wallet_saldo_insuficiente%' THEN 'error_wallet_saldo_insuficiente'
                WHEN v_error_msg LIKE '%error_wallet_inactive%' THEN 'error_wallet_inactive'
                WHEN v_error_msg LIKE '%error_destination_required%' THEN 'error_destination_required'
                WHEN v_error_msg LIKE '%error_transfer_same_wallet%' THEN 'error_transfer_same_wallet'
                ELSE 'error_voice_approve_failed'
            END;
            RETURN QUERY SELECT v_id, NULL::bigint, false, v_error_key;
        END;
    END LOOP;
END;
$function$
