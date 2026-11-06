CREATE OR REPLACE FUNCTION public.fn_editar_movimiento_caja(
    p_caja_id bigint, 
    p_nueva_fecha date, 
    p_nuevo_valor_ingreso numeric, 
    p_nuevo_valor_egreso numeric, 
    p_billetera_origen_id bigint, 
    p_billetera_destino_id bigint DEFAULT NULL::bigint, 
    p_estructura_egreso_id bigint DEFAULT NULL::bigint, 
    p_cuenta_ingreso_id bigint DEFAULT NULL::bigint, 
    p_nuevo_detalle text DEFAULT NULL::text, 
    p_nueva_descripcion text DEFAULT NULL::text,
    p_tarjeta_id bigint DEFAULT NULL::bigint,
    p_nuevo_tipo text DEFAULT NULL::text,
    p_nombre_cuenta_historico text DEFAULT NULL::text
)
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
$function$;