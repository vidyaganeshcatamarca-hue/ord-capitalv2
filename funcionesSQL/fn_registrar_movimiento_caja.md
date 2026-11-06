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
$function$

## Notas de validacion (RECONSTRUIDAS de Engram tras incidente 2026-10-16 — el cp directo borro la prosa original; parcial: ver INCIDENTE-nota-actualizacion-espejos.md)
- [obs 480] B8 compra/venta: patas del doble insert tituladas compra/venta de dolares (dd99f6e); el dueño eligio SIN retroactivo (pares historicos quedan con titulo generico).
- [obs 473] B1 moneda perdida: la moneda del movimiento se deriva de la billetera real, no de supuestos (6504444).
- [obs 531] Snapshot opcion B: valor_local/moneda_local/tasa_snapshot congelados al INSERT/UPDATE por trg_p_caja_snapshot_moneda; transfer excluido del snapshot.
- [historial] Transfer misma moneda: una sola fila (sin cambios); cross-currency requiere amount destino (patron copiado de fn_aprobar_cuarentena_v2); validado con ROLLBACK (bloqueo sin amount, doble insert).
- [obs 607] Deploy 75: cuerpo parcheado a fn_titulo_transferencia; v_moneda_local ahora se resuelve con fn_get_default_currency (antes declarada sin asignar desde siempre). NOTA de proceso: pg_get_functiondef termina sin ';' — agregarlo al regenerar cuerpos.
