CREATE OR REPLACE FUNCTION public.fn_gestionar_deuda(p_operacion text, p_prestamo_id bigint DEFAULT NULL::bigint, p_nombre_prestamo text DEFAULT NULL::text, p_tipo_deuda text DEFAULT NULL::text, p_saldo_actual numeric DEFAULT NULL::numeric, p_monto_original numeric DEFAULT NULL::numeric, p_tasa_anual_tna numeric DEFAULT NULL::numeric, p_cuota_mensual numeric DEFAULT NULL::numeric, p_proximo_vencimiento date DEFAULT NULL::date, p_moneda_iso text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_new_prestamo_id bigint;
    v_saldo numeric;
    v_monto numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_operacion = 'crear' THEN
        IF p_nombre_prestamo IS NULL OR p_saldo_actual IS NULL THEN
            RAISE EXCEPTION '{"key": "error_missing_required_fields", "params": {}}';
        END IF;

        v_monto := COALESCE(p_monto_original, p_saldo_actual, 0);
        v_saldo := COALESCE(p_saldo_actual, v_monto, 0);

        INSERT INTO public.p_prestamos (
            user_id,
            entidad_nombre,
            nombre_prestamo,
            tipo_entidad,
            tipo_deuda,
            tipo_flujo,
            monto_total_deuda,
            monto_original,
            monto_pagado_acumulado,
            saldo_actual,
            tasa_anual_tna,
            cuota_mensual,
            proximo_vencimiento,
            moneda_iso,
            estado
        ) VALUES (
            v_user_id,
            p_nombre_prestamo,
            p_nombre_prestamo,
            COALESCE(p_tipo_deuda, 'banco'),
            COALESCE(p_tipo_deuda, 'banco'),
            'debo',
            v_monto,
            v_monto,
            v_monto - v_saldo,
            v_saldo,
            COALESCE(p_tasa_anual_tna, 0),
            COALESCE(p_cuota_mensual, 0),
            p_proximo_vencimiento,
            COALESCE(p_moneda_iso, (SELECT COALESCE(moneda_default, 'ARS') FROM public.p_config_region WHERE user_id = (SELECT user_id FROM public.usuarios WHERE auth_id = auth.uid())), 'ARS'),
            'activo'
        )
        RETURNING prestamo_id INTO v_new_prestamo_id;

        -- Crear config de bola de nieve si no existe (para persistir estrategia)
        INSERT INTO public.p_config_bola_nieve (user_id, estrategia_activa, fecha_inicio_plan)
        VALUES (v_user_id, 'math', CURRENT_DATE)
        ON CONFLICT (user_id) DO NOTHING;

        RETURN v_new_prestamo_id;

    ELSIF p_operacion = 'editar' THEN
        IF p_prestamo_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        UPDATE public.p_prestamos SET
            entidad_nombre = COALESCE(p_nombre_prestamo, entidad_nombre),
            nombre_prestamo = COALESCE(p_nombre_prestamo, nombre_prestamo),
            tipo_entidad = COALESCE(p_tipo_deuda, tipo_entidad),
            tipo_deuda = COALESCE(p_tipo_deuda, tipo_deuda),
            monto_total_deuda = COALESCE(p_monto_original, monto_total_deuda),
            monto_original = COALESCE(p_monto_original, monto_original),
            saldo_actual = COALESCE(p_saldo_actual, saldo_actual),
            monto_pagado_acumulado = COALESCE(p_monto_original, monto_original) - COALESCE(p_saldo_actual, saldo_actual),
            tasa_anual_tna = COALESCE(p_tasa_anual_tna, tasa_anual_tna),
            cuota_mensual = COALESCE(p_cuota_mensual, cuota_mensual),
            proximo_vencimiento = COALESCE(p_proximo_vencimiento, proximo_vencimiento),
            moneda_iso = COALESCE(p_moneda_iso, moneda_iso)
        WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        RETURN p_prestamo_id;

    ELSIF p_operacion = 'archivar' THEN
        IF p_prestamo_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        UPDATE public.p_prestamos SET estado = 'archivado'
        WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        RETURN p_prestamo_id;

    ELSIF p_operacion = 'activar' THEN
        IF p_prestamo_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        UPDATE public.p_prestamos SET estado = 'activo'
        WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        RETURN p_prestamo_id;

    ELSE
        RAISE EXCEPTION '{"key": "error_invalid_operation", "params": {"operation": "%"}}', p_operacion;
    END IF;
END;
$function$

DECLARE
    v_user_id bigint;
    v_new_prestamo_id bigint;
    v_saldo numeric;
    v_monto numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_operacion = 'crear' THEN
        IF p_nombre_prestamo IS NULL OR p_saldo_actual IS NULL THEN
            RAISE EXCEPTION '{"key": "error_missing_required_fields", "params": {}}';
        END IF;

        v_monto := COALESCE(p_monto_original, p_saldo_actual, 0);
        v_saldo := COALESCE(p_saldo_actual, v_monto, 0);

        INSERT INTO public.p_prestamos (
            user_id,
            entidad_nombre,
            nombre_prestamo,
            tipo_entidad,
            tipo_deuda,
            tipo_flujo,
            monto_total_deuda,
            monto_original,
            monto_pagado_acumulado,
            saldo_actual,
            tasa_anual_tna,
            cuota_mensual,
            proximo_vencimiento,
            moneda_iso,
            estado
        ) VALUES (
            v_user_id,
            p_nombre_prestamo,
            p_nombre_prestamo,
            COALESCE(p_tipo_deuda, 'banco'),
            COALESCE(p_tipo_deuda, 'banco'),
            'debo',
            v_monto,
            v_monto,
            v_monto - v_saldo,
            v_saldo,
            COALESCE(p_tasa_anual_tna, 0),
            COALESCE(p_cuota_mensual, 0),
            p_proximo_vencimiento,
            COALESCE(p_moneda_iso, 'ARS'),
            'activo'
        )
        RETURNING prestamo_id INTO v_new_prestamo_id;

        INSERT INTO public.p_config_bola_nieve (user_id, estrategia_activa, fecha_inicio_plan)
        VALUES (v_user_id, 'math', CURRENT_DATE)
        ON CONFLICT (user_id) DO NOTHING;

        RETURN v_new_prestamo_id;

    ELSIF p_operacion = 'editar' THEN
        IF p_prestamo_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        UPDATE public.p_prestamos SET
            entidad_nombre = COALESCE(p_nombre_prestamo, entidad_nombre),
            nombre_prestamo = COALESCE(p_nombre_prestamo, nombre_prestamo),
            tipo_entidad = COALESCE(p_tipo_deuda, tipo_entidad),
            tipo_deuda = COALESCE(p_tipo_deuda, tipo_deuda),
            monto_total_deuda = COALESCE(p_monto_original, monto_total_deuda),
            monto_original = COALESCE(p_monto_original, monto_original),
            saldo_actual = COALESCE(p_saldo_actual, saldo_actual),
            monto_pagado_acumulado = COALESCE(p_monto_original, monto_original) - COALESCE(p_saldo_actual, saldo_actual),
            tasa_anual_tna = COALESCE(p_tasa_anual_tna, tasa_anual_tna),
            cuota_mensual = COALESCE(p_cuota_mensual, cuota_mensual),
            proximo_vencimiento = COALESCE(p_proximo_vencimiento, proximo_vencimiento),
            moneda_iso = COALESCE(p_moneda_iso, moneda_iso)
        WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        RETURN p_prestamo_id;

    ELSIF p_operacion = 'archivar' THEN
        IF p_prestamo_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        UPDATE public.p_prestamos SET estado = 'archivado'
        WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        RETURN p_prestamo_id;

    ELSIF p_operacion = 'activar' THEN
        IF p_prestamo_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        UPDATE public.p_prestamos SET estado = 'activo'
        WHERE prestamo_id = p_prestamo_id AND user_id = v_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}';
        END IF;

        RETURN p_prestamo_id;

    ELSE
        RAISE EXCEPTION '{"key": "error_invalid_operation", "params": {"operation": "%"}}', p_operacion;
    END IF;
END;
$function$
