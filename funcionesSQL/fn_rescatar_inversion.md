CREATE OR REPLACE FUNCTION public.fn_rescatar_inversion(p_inversion_id bigint, p_monto numeric, p_billetera_destino_id bigint, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_inversion RECORD;
    v_user_id bigint;
    v_categoria_inversion_id bigint;
    v_monto_restante numeric;
    v_movimiento_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    IF p_monto <= 0 THEN
        RAISE EXCEPTION '{"key": "error_investment_amount_zero", "params": {}}';
    END IF;

    SELECT * INTO v_inversion
    FROM p_inversiones
    WHERE inversion_id = p_inversion_id AND user_id = v_user_id;

    IF v_inversion.inversion_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_investment_not_found", "params": {}}';
    END IF;

    IF v_inversion.estado = 'finalizada' THEN
        RAISE EXCEPTION '{"key": "error_investment_already_liquidated", "params": {}}';
    END IF;

    v_monto_restante := COALESCE(v_inversion.monto_invertido_original, 0) - COALESCE(v_inversion.monto_liquidado, 0);
    IF p_monto > v_monto_restante THEN
        RAISE EXCEPTION '{"key": "error_investment_rescue_exceeds_balance", "params": {}}';
    END IF;

    -- Busqueda por tipo_cupo y no por nombre: el nombre es una key de i18n y
    -- puede cambiar sin que este flujo se rompa (ver 84).
    SELECT estructura_id INTO v_categoria_inversion_id
    FROM p_estructuras_egresos
    WHERE user_id = v_user_id AND tipo_cupo = 'investment'
    ORDER BY estructura_id LIMIT 1;

    INSERT INTO p_caja (
        user_id, tipo, billetera_origen_id, valor_ingreso,
        estructura_egreso_id, fecha, detalle, metadata
    ) VALUES (
        v_user_id, 'adjustment', p_billetera_destino_id, p_monto,
        v_categoria_inversion_id, p_fecha,
        'rescate_inversion: ' || v_inversion.nombre_activo,
        jsonb_build_object('inversion_id', p_inversion_id, 'es_rescate_parcial', true, 'investment_capital', true)
    )
    RETURNING p_caja_id INTO v_movimiento_id;

    UPDATE p_inversiones
    SET monto_liquidado = COALESCE(monto_liquidado, 0) + p_monto,
        valor_mercado_actual = GREATEST(0, COALESCE(valor_mercado_actual, monto_invertido_original) - p_monto),
        estado = CASE
            WHEN (COALESCE(monto_liquidado, 0) + p_monto) >= monto_invertido_original THEN 'finalizada'
            ELSE estado
        END,
        fecha_liquidacion = CASE
            WHEN (COALESCE(monto_liquidado, 0) + p_monto) >= monto_invertido_original THEN p_fecha
            ELSE fecha_liquidacion
        END
    WHERE inversion_id = p_inversion_id;

    RETURN v_movimiento_id;
END;
$function$;
