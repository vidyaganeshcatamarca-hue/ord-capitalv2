CREATE OR REPLACE FUNCTION public.fn_cargar_movimientos_voz(
    p_job_id uuid,
    p_movements jsonb
)
 RETURNS TABLE(
    voice_movement_index integer,
    pendiente_id bigint,
    ok boolean,
    error_key text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_movement jsonb;
    v_index int;
    v_pending_id bigint;
    v_ok boolean;
    v_error_key text;

    v_tipo text;
    v_amount numeric;
    v_destination_amount numeric;
    v_expense_category_id bigint;
    v_source_wallet_id bigint;
    v_destination_wallet_id bigint;
    v_card_id bigint;
    v_income_source_id bigint;
    v_currency text;
    v_installments int;
    v_date date;
    v_note text;

    v_cat_exists boolean;
    v_wallet_exists boolean;
    v_dest_wallet_exists boolean;
    v_card_exists boolean;
    v_income_exists boolean;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_movements IS NULL OR jsonb_typeof(p_movements) <> 'array' THEN
        RAISE EXCEPTION '{"key": "error_invalid_request", "params": {"field": "p_movements"}}';
    END IF;

    v_index := 0;
    FOR v_movement IN SELECT * FROM jsonb_array_elements(p_movements)
    LOOP
        v_pending_id := NULL;
        v_ok := false;
        v_error_key := NULL;

        BEGIN
            v_tipo := v_movement->>'type';
            v_amount := (v_movement->>'amount')::numeric;
            v_destination_amount := NULLIF(v_movement->>'destination_amount', '')::numeric;

            v_expense_category_id := NULLIF(v_movement->>'expense_category_id', '')::bigint;
            v_source_wallet_id := NULLIF(v_movement->>'source_wallet_id', '')::bigint;
            v_destination_wallet_id := NULLIF(v_movement->>'destination_wallet_id', '')::bigint;
            v_card_id := NULLIF(v_movement->>'card_id', '')::bigint;
            v_income_source_id := NULLIF(v_movement->>'income_source_id', '')::bigint;

            v_currency := NULLIF(v_movement->>'currency', '');
            v_installments := NULLIF(v_movement->>'installments', '')::int;
            v_date := NULLIF(v_movement->>'date', '')::date;
            v_note := NULLIF(v_movement->>'note', '');

            IF v_tipo NOT IN ('expense', 'income', 'transfer', 'card_expense') THEN
                v_error_key := 'error_voice_invalid_type';
                INSERT INTO p_caja_cuarentena (
                    user_id, origen, tipo, estado, monto, fecha, detalle,
                    billetera_id, billetera_destino_id, tarjeta_id,
                    estructura_egreso_id, cuenta_ingreso_id,
                    moneda, cuotas, destination_amount,
                    metadata
                )
                VALUES (
                    v_user_id, 'api_banco', v_tipo, 'pendiente', COALESCE(v_amount, 0),
                    COALESCE(v_date, CURRENT_DATE), v_note,
                    v_source_wallet_id, v_destination_wallet_id, v_card_id,
                    v_expense_category_id, v_income_source_id,
                    v_currency, v_installments, v_destination_amount,
                    jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'parse_error', v_error_key)
                )
                RETURNING pendiente_id INTO v_pending_id;

                RETURN QUERY SELECT v_index, v_pending_id, false, v_error_key;
                v_index := v_index + 1;
                CONTINUE;
            END IF;

            IF v_amount IS NULL OR v_amount <= 0 THEN
                v_error_key := 'error_voice_invalid_amount';
                INSERT INTO p_caja_cuarentena (
                    user_id, origen, tipo, estado, monto, fecha, detalle,
                    billetera_id, billetera_destino_id, tarjeta_id,
                    estructura_egreso_id, cuenta_ingreso_id,
                    moneda, cuotas, destination_amount,
                    metadata
                )
                VALUES (
                    v_user_id, 'api_banco', v_tipo, 'pendiente', COALESCE(v_amount, 0),
                    COALESCE(v_date, CURRENT_DATE), v_note,
                    v_source_wallet_id, v_destination_wallet_id, v_card_id,
                    v_expense_category_id, v_income_source_id,
                    v_currency, v_installments, v_destination_amount,
                    jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'parse_error', v_error_key)
                )
                RETURNING pendiente_id INTO v_pending_id;

                RETURN QUERY SELECT v_index, v_pending_id, false, v_error_key;
                v_index := v_index + 1;
                CONTINUE;
            END IF;

            v_cat_exists := false;
            IF v_expense_category_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM p_estructuras_egresos
                    WHERE estructura_id = v_expense_category_id AND user_id = v_user_id
                ) INTO v_cat_exists;
                IF NOT v_cat_exists THEN v_expense_category_id := NULL; END IF;
            END IF;

            v_wallet_exists := false;
            IF v_source_wallet_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM p_billeteras
                    WHERE billetera_id = v_source_wallet_id AND user_id = v_user_id
                ) INTO v_wallet_exists;
                IF NOT v_wallet_exists THEN v_source_wallet_id := NULL; END IF;
            END IF;

            v_dest_wallet_exists := false;
            IF v_destination_wallet_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM p_billeteras
                    WHERE billetera_id = v_destination_wallet_id AND user_id = v_user_id
                ) INTO v_dest_wallet_exists;
                IF NOT v_dest_wallet_exists THEN v_destination_wallet_id := NULL; END IF;
            END IF;

            v_card_exists := false;
            IF v_card_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM p_tarjetas_credito
                    WHERE tarjeta_id = v_card_id AND user_id = v_user_id
                ) INTO v_card_exists;
                IF NOT v_card_exists THEN v_card_id := NULL; END IF;
            END IF;

            v_income_exists := false;
            IF v_income_source_id IS NOT NULL THEN
                SELECT EXISTS(
                    SELECT 1 FROM p_ingresos
                    WHERE producto_id = v_income_source_id AND user_id = v_user_id
                ) INTO v_income_exists;
                IF NOT v_income_exists THEN v_income_source_id := NULL; END IF;
            END IF;

            IF v_tipo = 'card_expense' AND v_installments IS NULL THEN
                v_installments := 1;
            END IF;

            INSERT INTO p_caja_cuarentena (
                user_id, origen, tipo, estado, monto, fecha, detalle,
                billetera_id, billetera_destino_id, tarjeta_id,
                estructura_egreso_id, cuenta_ingreso_id,
                moneda, cuotas, destination_amount,
                metadata
            )
            VALUES (
                v_user_id, 'api_banco', v_tipo, 'pendiente', v_amount,
                COALESCE(v_date, CURRENT_DATE), v_note,
                v_source_wallet_id, v_destination_wallet_id, v_card_id,
                v_expense_category_id, v_income_source_id,
                v_currency, v_installments, v_destination_amount,
                jsonb_build_object('job_id', p_job_id, 'movement_index', v_index)
            )
            RETURNING pendiente_id INTO v_pending_id;

            v_ok := true;
            v_error_key := NULL;

        EXCEPTION WHEN OTHERS THEN
            v_ok := false;
            v_error_key := 'error_voice_insert_failed';
            v_pending_id := NULL;
        END;

        RETURN QUERY SELECT v_index, v_pending_id, v_ok, v_error_key;
        v_index := v_index + 1;
    END LOOP;
END;
$function$;
