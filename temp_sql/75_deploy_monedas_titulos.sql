-- temp_sql/75_deploy_monedas_titulos.sql
-- =====================================================================
-- T3/S17 - Titulos dinamicos de transferencia entre divisas.
--   * helper fn_titulo_transferencia(origen, destino, local)
--   * fn_registrar_movimiento_caja: CASE fijo -> helper. HALLAZGO: la
--     variable v_moneda_local era NULL (declarada sin asignar), asi que el
--     CASE legado siempre caia en entre_cuentas; ahora se resuelve la
--     moneda local real y las etiquetas compra/venta quedan activas (S17).
--   * fn_aprobar_cuarentena_v2: IF de titulos -> helper (con moneda local
--     via fn_get_default_currency; el aprobador legado no la resolvia)
-- NO toca: billeteras, cotizaciones, tarjetas, pagos.
-- Idempotente: DROP por firma EXACTA + CREATE OR REPLACE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper S17: titulo de una transferencia entre divisas (misma regla que
-- src/lib/transferTitles.ts buildTransferDetalle, 12/12 PASS).
--   * datos incompletos o misma moneda -> 'transfer_entre_cuentas'
--   * destino != local:
--       destino USD  -> 'transfer_compra_dolares' (cualquier origen no-USD:
--         semantica unificada con el aprobador legado)
--       otro destino -> JSON {"key":"transfer_compra_moneda","params":{"moneda":"<CODE>"}}
--   * destino = local (origen extranjero):
--       origen USD   -> 'transfer_venta_dolares'
--       otro origen  -> JSON {"key":"transfer_venta_moneda","params":{"moneda":"<CODE>"}}
-- El CODE lo resuelve el renderer con currencyName(code, lang) (el backend
-- no puede saber el idioma del usuario). USD conserva las keys legacy.

CREATE OR REPLACE FUNCTION public.fn_titulo_transferencia(p_origen text, p_destino text, p_local text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_origen  text := UPPER(TRIM(COALESCE(p_origen, '')));
    v_destino text := UPPER(TRIM(COALESCE(p_destino, '')));
    v_local   text := UPPER(TRIM(COALESCE(p_local, '')));
BEGIN
    IF v_origen = '' OR v_destino = '' OR v_local = '' THEN
        RETURN 'transfer_entre_cuentas';
    END IF;
    IF v_origen = v_destino THEN
        RETURN 'transfer_entre_cuentas';
    END IF;
    IF v_destino <> v_local THEN
        IF v_destino = 'USD' THEN
            RETURN 'transfer_compra_dolares';
        END IF;
        RETURN jsonb_build_object(
            'key', 'transfer_compra_moneda',
            'params', jsonb_build_object('moneda', v_destino))::text;
    END IF;
    IF v_origen = 'USD' THEN
        RETURN 'transfer_venta_dolares';
    END IF;
    RETURN jsonb_build_object(
        'key', 'transfer_venta_moneda',
        'params', jsonb_build_object('moneda', v_origen))::text;
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_registrar_movimiento_caja(p_tipo text, p_billetera_origen_id bigint, p_billetera_destino_id bigint, p_valor_ingreso numeric, p_valor_egreso numeric, p_descripcion text, p_fecha date, p_es_compartido boolean, p_estructura_egreso_id bigint, p_proyecto_id bigint, p_cuenta_ingreso_id bigint, p_detalle text, p_destination_amount numeric);

CREATE OR REPLACE FUNCTION public.fn_registrar_movimiento_caja(p_tipo text, p_billetera_origen_id bigint, p_billetera_destino_id bigint DEFAULT NULL::bigint, p_valor_ingreso numeric DEFAULT 0, p_valor_egreso numeric DEFAULT 0, p_descripcion text DEFAULT NULL::text, p_fecha date DEFAULT CURRENT_DATE, p_es_compartido boolean DEFAULT false, p_estructura_egreso_id bigint DEFAULT NULL::bigint, p_proyecto_id bigint DEFAULT NULL::bigint, p_cuenta_ingreso_id bigint DEFAULT NULL::bigint, p_detalle text DEFAULT NULL::text, p_destination_amount numeric DEFAULT NULL::numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_moneda_local text;
    v_user_id bigint;
    v_caja_id int8;
    v_es_fondo boolean;
    v_origen record;
    v_destino record;
    v_monto numeric;
    v_destino_moneda text;
    v_titulo_key text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- ── Resolver billetera de origen (obligatoria para todo tipo) ──
    SELECT billetera_id, user_id, activa, moneda, es_fondo_prevision, saldo_actual
    INTO v_origen
    FROM public.p_billeteras
    WHERE billetera_id = p_billetera_origen_id;

    IF v_origen.billetera_id IS NULL OR v_origen.user_id <> v_user_id THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
    END IF;

    IF v_origen.activa = false THEN
        RAISE EXCEPTION '{"key": "error_wallet_inactive", "params": {}}';
    END IF;

    -- ── Validación específica por tipo ──
    IF p_tipo = 'expense' THEN
        IF v_origen.es_fondo_prevision = TRUE THEN
            RAISE EXCEPTION '{"key": "error_wallet_is_savings_fund", "params": {}}';
        END IF;

        v_monto := p_valor_egreso;
        IF v_monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;
        IF v_origen.saldo_actual < v_monto THEN
            RAISE EXCEPTION '{"key": "error_transfer_insufficient_balance", "params": {}}';
        END IF;
    ELSIF p_tipo = 'income' THEN
        v_monto := p_valor_ingreso;
        IF v_monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;
    ELSIF p_tipo = 'transfer' THEN
        v_monto := p_valor_egreso;
        IF v_monto <= 0 THEN
            RAISE EXCEPTION '{"key": "error_invalid_amount", "params": {}}';
        END IF;

        IF p_billetera_destino_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_destination_required", "params": {}}';
        END IF;

        IF p_billetera_destino_id = p_billetera_origen_id THEN
            RAISE EXCEPTION '{"key": "error_transfer_same_wallet", "params": {}}';
        END IF;

        SELECT billetera_id, user_id, activa, moneda, es_fondo_prevision
        INTO v_destino
        FROM public.p_billeteras
        WHERE billetera_id = p_billetera_destino_id;

        IF v_destino.billetera_id IS NULL OR v_destino.user_id <> v_user_id THEN
            RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
        END IF;

        IF v_destino.activa = false THEN
            RAISE EXCEPTION '{"key": "error_wallet_inactive", "params": {}}';
        END IF;

        -- Bloqueo de fila del origen para evitar carrera entre dos
        -- transferencias concurrentes que gasten el mismo saldo.
        PERFORM 1
        FROM public.p_billeteras
        WHERE billetera_id = p_billetera_origen_id
        FOR UPDATE;

        IF v_origen.saldo_actual < v_monto THEN
            RAISE EXCEPTION '{"key": "error_transfer_insufficient_balance", "params": {}}';
        END IF;

        -- ── Cuarentena pattern (fn_aprobar_cuarentena_v2): ARS <-> USD and any
        -- other cross-currency pair cannot move as one row; the move is a
        -- double insert split by currency with an explicit destination amount.
        IF v_origen.moneda <> v_destino.moneda THEN
            IF p_destination_amount IS NULL OR p_destination_amount <= 0 THEN
                RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "destination_amount"}}';
            END IF;

            -- The i18n TITLE key lives in detalle exactly like the cuarentena
            -- approval does (report leg titles read COALESCE(detalle, key)).
            -- The user note is preserved in metadata.nota.
            -- S17: titulo dinamico (helper fn_titulo_transferencia; mismo arbol de
            -- decision que src/lib/transferTitles.ts). USD conserva las keys legacy.
            -- NOTA (hallazgo del test 75): la variable v_moneda_local de esta funcion
            -- SIEMPRE fue NULL (se declara y nadie la asigna): el CASE legado con
            -- "= NULL" caia siempre en ELSE -> entre_cuentas, y las etiquetas
            -- compra/venta solo existian en el camino de cuarentena. El helper
            -- resuelve la moneda local de verdad (fn_get_default_currency), lo que
            -- ACTIVA las etiquetas compra/venta que S17 pide.
            v_titulo_key := public.fn_titulo_transferencia(
                v_origen.moneda, v_destino.moneda,
                COALESCE(public.fn_get_default_currency(v_user_id), ''));

            INSERT INTO public.p_caja (
                user_id, tipo, billetera_origen_id,
                valor_egreso, valor_ingreso, nombre_cuenta_historico, fecha,
                es_compartido, proyecto_id, estructura_egreso_id, cuenta_ingreso_id,
                pagado_por_user_id, detalle, metadata, moneda, es_usd
            )
            VALUES (
                v_user_id, 'expense', v_origen.billetera_id,
                v_monto, 0, p_descripcion, p_fecha,
                p_es_compartido, p_proyecto_id, p_estructura_egreso_id, p_cuenta_ingreso_id,
                CASE WHEN p_es_compartido THEN v_user_id ELSE NULL END,
                v_titulo_key, jsonb_build_object('transfer_double_insert', true, 'nota', p_detalle),
                v_origen.moneda, (v_origen.moneda = 'USD')
            )
            RETURNING p_caja_id INTO v_caja_id;

            INSERT INTO public.p_caja (
                user_id, tipo, billetera_origen_id,
                valor_egreso, valor_ingreso, nombre_cuenta_historico, fecha,
                detalle, metadata, moneda, es_usd
            )
            VALUES (
                v_user_id, 'income', v_destino.billetera_id,
                0, p_destination_amount, p_descripcion, p_fecha,
                v_titulo_key, jsonb_build_object('transfer_double_insert', true, 'nota', p_detalle),
                v_destino.moneda, (v_destino.moneda = 'USD')
            );

            RETURN v_caja_id;
        END IF;
    ELSE
        RAISE EXCEPTION '{"key": "error_invalid_movement_type", "params": {}}';
    END IF;

    -- ── Insertar movimiento (los triggers actualizan los saldos) ──
    -- Movement currency = the currency the user typed the amount in: the
    -- origin wallet's currency (destination only for wallet-less rows).
    -- Omitting it made every row fall to the table default 'ARS' and the
    -- feed showed a bare 'ARS' code to GBP/EUR/RON users.
    INSERT INTO p_caja (
        user_id, tipo, billetera_origen_id, billetera_destino_id,
        valor_ingreso, valor_egreso, nombre_cuenta_historico, fecha,
        es_compartido, proyecto_id, estructura_egreso_id, cuenta_ingreso_id,
        pagado_por_user_id, detalle, moneda
    )
    VALUES (
        v_user_id, p_tipo, p_billetera_origen_id, p_billetera_destino_id,
        p_valor_ingreso, p_valor_egreso, p_descripcion, p_fecha,
        p_es_compartido, p_proyecto_id, p_estructura_egreso_id, p_cuenta_ingreso_id,
        CASE WHEN p_es_compartido THEN v_user_id ELSE NULL END,
        p_detalle,
        COALESCE(
            (SELECT b.moneda FROM p_billeteras b WHERE b.billetera_id = p_billetera_origen_id),
            (SELECT b.moneda FROM p_billeteras b WHERE b.billetera_id = p_billetera_destino_id)
        )
    )
    RETURNING p_caja_id INTO v_caja_id;

    RETURN v_caja_id;
END;
$function$;

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
