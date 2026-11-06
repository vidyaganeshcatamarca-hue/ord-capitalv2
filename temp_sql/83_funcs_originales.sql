#### fn_crear_subcuenta_egreso [fn_crear_subcuenta_egreso(bigint,text,text,text,boolean,boolean,smallint,smallint)]
CREATE OR REPLACE FUNCTION public.fn_crear_subcuenta_egreso(p_padre_id bigint, p_nombre text, p_descripcion text, p_icono text, p_es_deseo boolean DEFAULT false, p_es_hormiga boolean DEFAULT false, p_utilidad_placer smallint DEFAULT 5, p_flexibilidad_recorte smallint DEFAULT 5)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint; 
    v_estructura_id bigint;
    v_tipo_cupo_padre text;
    v_hogar_id_padre bigint;
    v_color_padre text;
    v_icono_padre text;
    v_real_children int;
    v_nd_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT tipo_cupo, hogar_id, color, icono
    INTO v_tipo_cupo_padre, v_hogar_id_padre, v_color_padre, v_icono_padre
    FROM public.p_estructuras_egresos 
    WHERE estructura_id = p_padre_id AND user_id = v_user_id;

    IF NOT FOUND THEN RAISE EXCEPTION '{"key": "error_category_parent_not_found", "params": {}}'; END IF;

    -- Detect first real child: count non-no_detail children BEFORE inserting the new one
    SELECT COUNT(*) INTO v_real_children
    FROM public.p_estructuras_egresos
    WHERE padre_id = p_padre_id AND user_id = v_user_id AND nombre_cuenta <> 'no_detail';

    IF v_real_children = 0 THEN
        -- First real subcuenta: find or create no_detail, then migrate parent records
        SELECT estructura_id INTO v_nd_id
        FROM public.p_estructuras_egresos
        WHERE padre_id = p_padre_id AND user_id = v_user_id AND nombre_cuenta = 'no_detail';

        IF NOT FOUND THEN
            -- Legacy fallback: create no_detail inline using parent's attributes
            INSERT INTO public.p_estructuras_egresos (
                padre_id, user_id, nombre_cuenta, descripcion, icono, color, tipo_cupo, hogar_id
            )
            VALUES (
                p_padre_id, v_user_id, 'no_detail', 'desc_quick_load',
                v_icono_padre, v_color_padre, v_tipo_cupo_padre, v_hogar_id_padre
            )
            RETURNING estructura_id INTO v_nd_id;
        END IF;

        -- Migrate all parent-pointing rows to no_detail
        UPDATE public.p_caja
        SET estructura_egreso_id = v_nd_id
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id;

        UPDATE public.p_gastos_recurrentes
        SET estructura_egreso_id = v_nd_id
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id;

        UPDATE public.p_caja_cuarentena
        SET estructura_egreso_id = v_nd_id
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id;

        UPDATE public.p_gastos_fijos_config
        SET estructura_egreso_id = v_nd_id
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id;

        -- Budget merge: INSERT parent rows into no_detail, sum on conflict, then DELETE originals
        INSERT INTO public.p_presupuestos (estructura_egreso_id, user_id, hogar_id, monto_limite, mes_periodo, dia_ancla)
        SELECT v_nd_id, user_id, hogar_id, monto_limite, mes_periodo, dia_ancla
        FROM public.p_presupuestos
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id
        ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0))
        DO UPDATE SET monto_limite = p_presupuestos.monto_limite + EXCLUDED.monto_limite;

        DELETE FROM public.p_presupuestos
        WHERE estructura_egreso_id = p_padre_id AND user_id = v_user_id;
    END IF;

    INSERT INTO public.p_estructuras_egresos (
        padre_id, user_id, nombre_cuenta, descripcion, icono, 
        es_deseo, es_hormiga, utilidad_placer, flexibilidad_recorte, 
        tipo_cupo, hogar_id
    )
    VALUES (
        p_padre_id, v_user_id, p_nombre, p_descripcion, p_icono, 
        p_es_deseo, p_es_hormiga, p_utilidad_placer, p_flexibilidad_recorte,
        v_tipo_cupo_padre, v_hogar_id_padre
    ) 
    RETURNING estructura_id INTO v_estructura_id;
    
    RETURN v_estructura_id;
END; $function$


#### fn_editar_movimiento_caja [fn_editar_movimiento_caja(bigint,date,numeric,numeric,bigint,bigint,bigint,bigint,text,text,bigint,text,text)]
CREATE OR REPLACE FUNCTION public.fn_editar_movimiento_caja(p_caja_id bigint, p_nueva_fecha date, p_nuevo_valor_ingreso numeric, p_nuevo_valor_egreso numeric, p_billetera_origen_id bigint, p_billetera_destino_id bigint DEFAULT NULL::bigint, p_estructura_egreso_id bigint DEFAULT NULL::bigint, p_cuenta_ingreso_id bigint DEFAULT NULL::bigint, p_nuevo_detalle text DEFAULT NULL::text, p_nueva_descripcion text DEFAULT NULL::text, p_tarjeta_id bigint DEFAULT NULL::bigint, p_nuevo_tipo text DEFAULT NULL::text, p_nombre_cuenta_historico text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint;
    v_old_tarjeta_id bigint;
    v_old_fecha date;
    v_old_valor_egreso numeric;
    r_cuota RECORD;
    v_monto_cuota numeric;
    v_mes_periodo date;
    v_cuotas_cant integer;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- Obtener valores anteriores
    SELECT tarjeta_id, fecha, valor_egreso INTO v_old_tarjeta_id, v_old_fecha, v_old_valor_egreso
    FROM p_caja 
    WHERE p_caja.p_caja_id = fn_editar_movimiento_caja.p_caja_id AND p_caja.user_id = v_user_id;

    IF NOT FOUND THEN RAISE EXCEPTION '{"key": "error_movement_edit_forbidden", "params": {}}'; END IF;

    -- Actualizar el movimiento principal
    UPDATE p_caja SET 
        fecha = p_nueva_fecha, 
        valor_ingreso = p_nuevo_valor_ingreso,
        valor_egreso = p_nuevo_valor_egreso, 
        billetera_origen_id = p_billetera_origen_id,
        billetera_destino_id = p_billetera_destino_id,
        estructura_egreso_id = p_estructura_egreso_id,
        cuenta_ingreso_id = p_cuenta_ingreso_id,
        detalle = p_nuevo_detalle, 
        observaciones = p_nueva_descripcion,
        tarjeta_id = p_tarjeta_id,
        tipo = COALESCE(p_nuevo_tipo, tipo),
        nombre_cuenta_historico = COALESCE(p_nombre_cuenta_historico, nombre_cuenta_historico)
    WHERE p_caja.p_caja_id = fn_editar_movimiento_caja.p_caja_id AND p_caja.user_id = v_user_id;

    -- Si cambió la tarjeta o el monto/fecha en un gasto de tarjeta:
    IF v_old_tarjeta_id IS NOT NULL OR p_tarjeta_id IS NOT NULL THEN
        -- 1. Si antes tenía tarjeta, restar del compromiso anterior
        IF v_old_tarjeta_id IS NOT NULL THEN
            FOR r_cuota IN 
                SELECT numero_cuota, monto_cuota, fecha_estimada_pago 
                FROM p_cuotas_detalle 
                WHERE p_cuotas_detalle.p_caja_id = fn_editar_movimiento_caja.p_caja_id AND p_cuotas_detalle.user_id = v_user_id
            LOOP
                v_mes_periodo := date_trunc('month', r_cuota.fecha_estimada_pago);
                UPDATE p_compromisos_tarjeta 
                SET monto_cuota = GREATEST(0, monto_cuota - r_cuota.monto_cuota)
                WHERE tarjeta_id = v_old_tarjeta_id AND mes_periodo = v_mes_periodo AND user_id = v_user_id;
            END LOOP;
        END IF;

        -- 2. Si se cambió a una nueva tarjeta (o se mantiene la misma)
        IF p_tarjeta_id IS NOT NULL THEN
            -- Obtener cantidad de cuotas
            SELECT COUNT(*)::integer INTO v_cuotas_cant 
            FROM p_cuotas_detalle 
            WHERE p_cuotas_detalle.p_caja_id = fn_editar_movimiento_caja.p_caja_id AND p_cuotas_detalle.user_id = v_user_id;

            IF v_cuotas_cant = 0 THEN
                -- Si se cambió de billetera a tarjeta, crear 1 cuota por defecto
                INSERT INTO p_cuotas_detalle (
                    user_id, tarjeta_id, numero_cuota, monto_cuota, fecha_estimada_pago, pagado, p_caja_id
                ) VALUES (
                    v_user_id, p_tarjeta_id, 1, p_nuevo_valor_egreso, p_nueva_fecha, false, fn_editar_movimiento_caja.p_caja_id
                );
                
                -- Actualizar el valor en p_caja para asegurar cuotas_totales = 1
                UPDATE p_caja SET cuotas_totales = 1 WHERE p_caja.p_caja_id = fn_editar_movimiento_caja.p_caja_id;
            ELSE
                -- Actualizar tarjeta_id en p_cuotas_detalle
                UPDATE p_cuotas_detalle 
                SET tarjeta_id = p_tarjeta_id
                WHERE p_cuotas_detalle.p_caja_id = fn_editar_movimiento_caja.p_caja_id AND p_cuotas_detalle.user_id = v_user_id;

                -- Si cambió el monto o la fecha, actualizar los montos/fechas de las cuotas
                IF p_nuevo_valor_egreso != v_old_valor_egreso OR p_nueva_fecha != v_old_fecha THEN
                    v_monto_cuota := p_nuevo_valor_egreso / v_cuotas_cant;
                    
                    -- Actualizar cada cuota individual
                    FOR r_cuota IN 
                        SELECT cuota_id, numero_cuota 
                        FROM p_cuotas_detalle 
                        WHERE p_cuotas_detalle.p_caja_id = fn_editar_movimiento_caja.p_caja_id AND p_cuotas_detalle.user_id = v_user_id
                    LOOP
                        UPDATE p_cuotas_detalle 
                        SET monto_cuota = v_monto_cuota,
                            fecha_estimada_pago = p_nueva_fecha + ((r_cuota.numero_cuota - 1) || ' months')::interval
                        WHERE cuota_id = r_cuota.cuota_id;
                    END LOOP;
                END IF;
            END IF;

            -- Sumar a los compromisos de la tarjeta destino/nueva
            FOR r_cuota IN 
                SELECT numero_cuota, monto_cuota, fecha_estimada_pago 
                FROM p_cuotas_detalle 
                WHERE p_cuotas_detalle.p_caja_id = fn_editar_movimiento_caja.p_caja_id AND p_cuotas_detalle.user_id = v_user_id
            LOOP
                v_mes_periodo := date_trunc('month', r_cuota.fecha_estimada_pago);
                INSERT INTO p_compromisos_tarjeta (tarjeta_id, user_id, monto_cuota, mes_periodo)
                VALUES (p_tarjeta_id, v_user_id, r_cuota.monto_cuota, v_mes_periodo)
                ON CONFLICT (tarjeta_id, mes_periodo, user_id) 
                DO UPDATE SET monto_cuota = p_compromisos_tarjeta.monto_cuota + EXCLUDED.monto_cuota, pagado = false;
            END LOOP;
        ELSE
            -- Si p_tarjeta_id es NULL (se cambió el gasto de Tarjeta a Billetera),
            -- eliminar las cuotas asociadas ya que ahora es un movimiento normal de billetera
            DELETE FROM p_cuotas_detalle WHERE p_cuotas_detalle.p_caja_id = fn_editar_movimiento_caja.p_caja_id AND p_cuotas_detalle.user_id = v_user_id;
        END IF;
    END IF;
END;
$function$


#### fn_editar_movimiento_caja [fn_editar_movimiento_caja(bigint,date,numeric,numeric,bigint,bigint,bigint,bigint,text,text)]
CREATE OR REPLACE FUNCTION public.fn_editar_movimiento_caja(p_caja_id bigint, p_nueva_fecha date, p_nuevo_valor_ingreso numeric, p_nuevo_valor_egreso numeric, p_billetera_origen_id bigint, p_billetera_destino_id bigint DEFAULT NULL::bigint, p_estructura_egreso_id bigint DEFAULT NULL::bigint, p_cuenta_ingreso_id bigint DEFAULT NULL::bigint, p_nuevo_detalle text DEFAULT NULL::text, p_nueva_descripcion text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE p_caja SET 
        fecha = p_nueva_fecha, 
        valor_ingreso = p_nuevo_valor_ingreso,
        valor_egreso = p_nuevo_valor_egreso, 
        billetera_origen_id = p_billetera_origen_id,
        billetera_destino_id = p_billetera_destino_id,
        estructura_egreso_id = p_estructura_egreso_id,
        cuenta_ingreso_id = p_cuenta_ingreso_id,
        detalle = p_nuevo_detalle, 
        observaciones = p_nueva_descripcion
    WHERE p_caja_id = p_caja_id AND user_id = v_user_id;

    IF NOT FOUND THEN RAISE EXCEPTION '{"key": "error_movement_edit_forbidden", "params": {}}'; END IF;
END;
$function$


#### fn_editar_movimiento_caja [fn_editar_movimiento_caja(bigint,date,numeric,numeric,bigint,text,text)]
CREATE OR REPLACE FUNCTION public.fn_editar_movimiento_caja(p_caja_id bigint, p_nueva_fecha date, p_nuevo_valor_ingreso numeric, p_nuevo_valor_egreso numeric, p_estructura_egreso_id bigint, p_nuevo_detalle text, p_nueva_descripcion text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE p_caja SET 
        fecha = p_nueva_fecha, valor_ingreso = p_nuevo_valor_ingreso,
        valor_egreso = p_nuevo_valor_egreso, estructura_egreso_id = p_estructura_egreso_id,
        detalle = p_nuevo_detalle, observaciones = p_nueva_descripcion
    WHERE p_caja_id = p_caja_id AND user_id = v_user_id;

    IF NOT FOUND THEN RAISE EXCEPTION '{"key": "error_movement_edit_forbidden", "params": {}}'; END IF;
END;
$function$


#### fn_registrar_movimiento_caja [fn_registrar_movimiento_caja(text,bigint,bigint,numeric,numeric,text,date,boolean,bigint,bigint,bigint,text,numeric)]
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


