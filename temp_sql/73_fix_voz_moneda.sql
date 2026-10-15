-- 73_fix_voz_moneda.sql
-- ================================
-- Bug 1 + Bug 2 (voice -> cuarentena):
--   1) fn_reporte_mapa_tarjetas ahora devuelve la moneda real (moneda_iso)
--      de cada tarjeta para que VoiceContextBuilder deje de hardcodear
--      ['ARS','USD'] en cards[].supported_currencies.
--   2) fn_cargar_movimientos_voz: v_moneda_local se asigna desde la
--      region confirmada del usuario; la moneda declarada se normaliza
--      a NULL (sin tirar toda la fila) cuando no existe en p_divisas;
--      el CHECK de moneda pasa a aceptar cualquier codigo ISO de 3 letras.
-- No modifica api/worker/n8n/parser ni prompt ni la tabla voice_jobs.

DROP FUNCTION IF EXISTS public.fn_reporte_mapa_tarjetas();

CREATE OR REPLACE FUNCTION public.fn_reporte_mapa_tarjetas()
 RETURNS TABLE(tarjeta_id bigint, nombre_tarjeta text, limite_un_pago_total numeric, un_pago_disponible numeric, limite_cuotas_total numeric, cuotas_disponible numeric, estado_config text, dia_cierre integer, dia_vencimiento integer, banco text, color text, recargo_dolar_pct numeric, cotizacion_usd numeric, un_pago_consumido_ars numeric, un_pago_consumido_usd numeric, cuotas_futuras_consumido_ars numeric, cuotas_futuras_consumido_usd numeric, moneda_iso character)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_hoy date := CURRENT_DATE;
    v_dia_hoy int := EXTRACT(DAY FROM CURRENT_DATE);
    v_mes_actual date := date_trunc('month', CURRENT_DATE);
    r_tarjeta RECORD;
    v_inicio_ciclo date;
    v_fin_ciclo date;
    v_vencimiento_ciclo date;
    v_cotizacion_usd numeric;
    v_consumo_un_pago_ars numeric;
    v_moneda_local text;
    v_consumo_un_pago_usd numeric;
    v_consumo_un_pago_total_ars_equiv numeric;
    v_consumo_cuotas_ars numeric;
    v_consumo_cuotas_usd numeric;
    v_consumo_cuotas_total_ars_equiv numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS') INTO v_moneda_local;

    SELECT COALESCE(
        (SELECT valor_por_usd FROM p_divisas WHERE nombre = COALESCE(
            (SELECT moneda_default FROM p_config_region WHERE user_id = v_user_id),
            'ARS') ORDER BY ultima_actualizacion DESC LIMIT 1),
        1.00
    ) INTO v_cotizacion_usd;

    FOR r_tarjeta IN
        SELECT t.tarjeta_id, t.nombre_tarjeta, t.dia_cierre, t.dia_vencimiento,
               t.banco, t.color, t.limite_un_pago, t.limite_cuotas, t.recargo_dolar_pct,
               t.moneda_iso
        FROM p_tarjetas_credito t
        WHERE t.user_id = v_user_id AND t.activa = true
    LOOP
        IF COALESCE(r_tarjeta.limite_un_pago, 0) = 0 AND COALESCE(r_tarjeta.limite_cuotas, 0) = 0 THEN
            RETURN QUERY SELECT
                r_tarjeta.tarjeta_id, r_tarjeta.nombre_tarjeta,
                0::numeric, 0::numeric, 0::numeric, 0::numeric,
                'requires_configuration'::text,
                r_tarjeta.dia_cierre, r_tarjeta.dia_vencimiento, r_tarjeta.banco, r_tarjeta.color,
                COALESCE(r_tarjeta.recargo_dolar_pct, 0.00)::numeric,
                COALESCE(v_cotizacion_usd, 1.00)::numeric,
                0::numeric, 0::numeric, 0::numeric, 0::numeric,
                r_tarjeta.moneda_iso;
            CONTINUE;
        END IF;

        IF v_dia_hoy <= r_tarjeta.dia_cierre THEN
            v_inicio_ciclo := (v_mes_actual - INTERVAL '1 month') + (r_tarjeta.dia_cierre * INTERVAL '1 day');
            v_fin_ciclo := v_mes_actual + ((r_tarjeta.dia_cierre - 1) * INTERVAL '1 day');
        ELSE
            v_inicio_ciclo := v_mes_actual + (r_tarjeta.dia_cierre * INTERVAL '1 day');
            v_fin_ciclo := (v_mes_actual + INTERVAL '1 month') + ((r_tarjeta.dia_cierre - 1) * INTERVAL '1 day');
        END IF;

        IF r_tarjeta.dia_vencimiento <= r_tarjeta.dia_cierre THEN
            v_vencimiento_ciclo := (date_trunc('month', v_fin_ciclo) + INTERVAL '1 month') + ((r_tarjeta.dia_vencimiento - 1) * INTERVAL '1 day');
        ELSE
            v_vencimiento_ciclo := date_trunc('month', v_fin_ciclo) + ((r_tarjeta.dia_vencimiento - 1) * INTERVAL '1 day');
        END IF;

        SELECT
            COALESCE(SUM(CASE WHEN cd.moneda = v_moneda_local THEN cd.monto_cuota ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0)
          INTO v_consumo_un_pago_ars, v_consumo_un_pago_usd
          FROM p_cuotas_detalle cd
          WHERE cd.tarjeta_id = r_tarjeta.tarjeta_id AND cd.pagado = false
            AND cd.fecha_estimada_pago <= v_vencimiento_ciclo;
        v_consumo_un_pago_total_ars_equiv := v_consumo_un_pago_ars + (v_consumo_un_pago_usd * v_cotizacion_usd);

        SELECT
            COALESCE(SUM(CASE WHEN cd.moneda = v_moneda_local THEN cd.monto_cuota ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0)
          INTO v_consumo_cuotas_ars, v_consumo_cuotas_usd
          FROM p_cuotas_detalle cd
          WHERE cd.tarjeta_id = r_tarjeta.tarjeta_id AND cd.pagado = false
            AND cd.fecha_estimada_pago > v_vencimiento_ciclo;
        v_consumo_cuotas_total_ars_equiv := v_consumo_cuotas_ars + (v_consumo_cuotas_usd * v_cotizacion_usd);

        RETURN QUERY SELECT
            r_tarjeta.tarjeta_id, r_tarjeta.nombre_tarjeta, r_tarjeta.limite_un_pago,
            (r_tarjeta.limite_un_pago - v_consumo_un_pago_total_ars_equiv),
            r_tarjeta.limite_cuotas,
            (r_tarjeta.limite_cuotas - v_consumo_cuotas_total_ars_equiv),
            'ok'::text,
            r_tarjeta.dia_cierre, r_tarjeta.dia_vencimiento, r_tarjeta.banco, r_tarjeta.color,
            COALESCE(r_tarjeta.recargo_dolar_pct, 0.00)::numeric,
            v_cotizacion_usd,
            v_consumo_un_pago_ars, v_consumo_un_pago_usd,
            v_consumo_cuotas_ars, v_consumo_cuotas_usd,
            r_tarjeta.moneda_iso;
    END LOOP;
END;
$function$;


DROP FUNCTION IF EXISTS public.fn_cargar_movimientos_voz(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.fn_cargar_movimientos_voz(p_job_id uuid, p_movements jsonb)
 RETURNS TABLE(voice_movement_index integer, pendiente_id bigint, ok boolean, error_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_moneda_local text;
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

    -- Moneda local de la region confirmada (mismo patron que fn_reporte_mapa_tarjetas):
    -- antes quedaba NULL y el filtro de moneda era inerte, dejando pasar divisas
    -- que la CHECK de la tabla rechazaba y tirando los datos de la fila.
    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS') INTO v_moneda_local;

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

            -- Normalizacion: valores que violarian CHECKs se vuelven NULL
            -- (la cuarentena existe para datos incompletos; el usuario edita).
            IF v_destination_amount IS NOT NULL AND v_destination_amount <= 0 THEN
                v_destination_amount := NULL;
            END IF;
            IF v_installments IS NOT NULL AND v_installments <= 0 THEN
                v_installments := NULL;
            END IF;
            v_currency := UPPER(TRIM(COALESCE(v_currency, '')));
            IF v_currency = '' OR v_currency NOT IN (v_moneda_local, 'USD') THEN
                v_currency := NULL;
            END IF;
            -- Solo divisas reales del app: una moneda sin cotizacion cargada
            -- se pierde SIN tumba la fila (queda la moneda de la billetera).
            IF v_currency IS NOT NULL AND NOT EXISTS (SELECT 1 FROM p_divisas WHERE nombre = v_currency) THEN
                v_currency := NULL;
            END IF;

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
                    v_user_id, 'voz', v_tipo, 'pendiente', COALESCE(v_amount, 0),
                    COALESCE(v_date, CURRENT_DATE), v_note,
                    v_source_wallet_id, v_destination_wallet_id, v_card_id,
                    v_expense_category_id, v_income_source_id,
                    v_currency, v_installments, v_destination_amount,
                    jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'parse_error', v_error_key)
                )
                RETURNING p_caja_cuarentena.pendiente_id INTO v_pending_id;

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
                    v_user_id, 'voz', v_tipo, 'pendiente', COALESCE(v_amount, 0),
                    COALESCE(v_date, CURRENT_DATE), v_note,
                    v_source_wallet_id, v_destination_wallet_id, v_card_id,
                    v_expense_category_id, v_income_source_id,
                    v_currency, v_installments, v_destination_amount,
                    jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'parse_error', v_error_key)
                )
                RETURNING p_caja_cuarentena.pendiente_id INTO v_pending_id;

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
                v_user_id, 'voz', v_tipo, 'pendiente', v_amount,
                COALESCE(v_date, CURRENT_DATE), v_note,
                v_source_wallet_id, v_destination_wallet_id, v_card_id,
                v_expense_category_id, v_income_source_id,
                v_currency, v_installments, v_destination_amount,
                jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'ambiguous_matches', v_movement->'ambiguous_matches')
            )
            RETURNING p_caja_cuarentena.pendiente_id INTO v_pending_id;

            v_ok := true;
            v_error_key := NULL;

        EXCEPTION WHEN OTHERS THEN
            v_ok := false;
            v_error_key := 'error_voice_parse_failed';
            v_pending_id := NULL;
            -- El movimiento NO se pierde: cae como item incompleto editable
            -- (tipo NULL, monto 0, fecha de hoy, el movimiento crudo en metadata).
            BEGIN
                INSERT INTO p_caja_cuarentena (
                    user_id, origen, tipo, estado, monto, fecha, detalle, metadata
                )
                VALUES (
                    v_user_id, 'voz', NULL, 'pendiente', 0, CURRENT_DATE, v_note,
                    jsonb_build_object('job_id', p_job_id, 'movement_index', v_index, 'parse_error', v_error_key, 'raw_movement', v_movement)
                )
                RETURNING p_caja_cuarentena.pendiente_id INTO v_pending_id;
            EXCEPTION WHEN OTHERS THEN
                v_pending_id := NULL;
            END;
        END;

        RETURN QUERY SELECT v_index, v_pending_id, v_ok, v_error_key;
        v_index := v_index + 1;
    END LOOP;
END;
$function$;


-- La moneda dejan de limitarse a ARS/USD: cualquier codigo ISO de 3 letras.
-- La validacion de divisas del app vive en p_divisas y la aplican los
-- loaders (eg. fn_cargar_movimientos_voz) antes de insertar.
ALTER TABLE public.p_caja_cuarentena
    DROP CONSTRAINT IF EXISTS p_caja_cuarentena_moneda_check;

ALTER TABLE public.p_caja_cuarentena
    ADD CONSTRAINT p_caja_cuarentena_moneda_check
    CHECK (moneda IS NULL OR moneda ~ '^[A-Z]{3}$');