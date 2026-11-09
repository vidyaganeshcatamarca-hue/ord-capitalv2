-- Registra un rendimiento manual sobre una reserva REAL que genera rendimientos.
-- Tres pasos en una transaccion: (1) el ingreso entra a la billetera, (2) el
-- mismo asiento de aporte real lo saca hacia el sobre, (3) la porcion real crece.
-- Neto en la billetera: 0. Ingresos: +importe. Disponible libre: sin cambios.
-- La fecha es la de registro en ORD, sin selector. Permitido en Free.
-- PRD: DF-21, DF-22, DF-23, DF-24.

CREATE OR REPLACE FUNCTION public.fn_sobre_rendimiento_registrar(p_sobre_id bigint, p_billetera_id bigint, p_importe numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_sobre public.p_sobres;
    v_saldo_real numeric;
    v_genera boolean;
    v_producto bigint;
    v_ingreso_id bigint;
    v_caja_id bigint;
    v_movimiento_id bigint;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT * INTO v_sobre FROM public.p_sobres b
    WHERE b.sobre_id = p_sobre_id AND b.user_id = v_user_id;
    IF v_sobre.sobre_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_not_found", "params": {}}';
    END IF;
    IF v_sobre.archivado_at IS NOT NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_archived", "params": {}}';
    END IF;
    IF p_importe IS NULL OR p_importe <= 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_amount_invalid", "params": {}}';
    END IF;

    SELECT COALESCE(SUM(CASE WHEN m.tipo = 'rescate' THEN -m.importe ELSE m.importe END), 0),
           COALESCE(BOOL_OR(m.genera_rendimiento AND m.tipo = 'aporte'), false)
    INTO v_saldo_real, v_genera
    FROM public.p_sobre_movimientos m
    WHERE m.sobre_id = p_sobre_id
      AND m.billetera_id = p_billetera_id
      AND m.modalidad = 'real';

    IF NOT v_genera THEN
        RAISE EXCEPTION '{"key": "error_sobre_yield_not_allowed", "params": {}}';
    END IF;
    IF v_saldo_real <= 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_yield_no_reserve", "params": {}}';
    END IF;

    v_producto := public.fn_sobre_producto_rendimiento(v_user_id);

    -- Paso 1: el ingreso entra a la billetera.
    INSERT INTO public.p_caja (
        user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso,
        fecha, moneda, cuenta_ingreso_id, detalle, metadata
    ) VALUES (
        v_user_id, 'income', p_billetera_id, p_importe, 0,
        CURRENT_DATE, v_sobre.moneda, v_producto, 'savings_yield',
        jsonb_build_object('savings_yield', true, 'sobre_id', p_sobre_id)
    )
    RETURNING p_caja_id INTO v_ingreso_id;

    -- Paso 2: el mismo asiento que un aporte real lo saca hacia el sobre.
    v_caja_id := public.fn_sobre_pata_billetera(
        v_user_id, p_billetera_id, v_sobre.moneda, p_importe, true,
        'savings_envelope_aporte_real', p_sobre_id, v_sobre.nombre
    );

    -- Paso 3: la porción real del sobre crece.
    INSERT INTO public.p_sobre_movimientos (
        sobre_id, user_id, tipo, importe, moneda, billetera_id, modalidad,
        genera_rendimiento, fecha, caja_ingreso_id, caja_movimiento_id
    ) VALUES (
        p_sobre_id, v_user_id, 'rendimiento', p_importe, v_sobre.moneda, p_billetera_id,
        'real', true, CURRENT_DATE, v_ingreso_id, v_caja_id
    )
    RETURNING movimiento_id INTO v_movimiento_id;

    UPDATE public.p_sobres SET actualizado_at = now() WHERE sobre_id = p_sobre_id;

    RETURN v_movimiento_id;
END;
$function$;
