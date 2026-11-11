CREATE OR REPLACE FUNCTION public.fn_liquidar_inversion(p_inversion_id bigint, p_monto_total_retirado numeric, p_billetera_destino_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_inversion RECORD;
    v_ganancia_perdida numeric;
    v_categoria_inversion_id bigint;
    v_user_id bigint;
    v_ingreso_id bigint;
    v_ya_retirado numeric;
    v_por_acentrar numeric;
    v_moneda_billetera text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
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

    -- S15: la billetera de destino tiene que ser del usuario y de la misma
    -- moneda que la inversión (comparación sin distinguir mayúsculas).
    SELECT moneda INTO v_moneda_billetera
    FROM public.p_billeteras
    WHERE billetera_id = p_billetera_destino_id AND user_id = v_user_id;

    IF v_moneda_billetera IS NULL THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
    END IF;

    IF btrim(upper(v_moneda_billetera)) <> btrim(upper(COALESCE(v_inversion.moneda, 'ARS'))) THEN
        RAISE EXCEPTION '{"key": "error_wallet_currency_mismatch", "params": {}}';
    END IF;

    -- El total que el usuario recebe no puede ser menor que lo ya retirado.
    v_ya_retirado := COALESCE(v_inversion.monto_liquidado, 0);
    IF p_monto_total_retirado < v_ya_retirado THEN
        RAISE EXCEPTION '{"key": "error_investment_rescue_exceeds_balance", "params": {}}';
    END IF;

    -- Busqueda por tipo_cupo y no por nombre: el nombre es una key de i18n y
    -- puede cambiar sin que este flujo se rompa (ver 84).
    SELECT estructura_id INTO v_categoria_inversion_id
    FROM p_estructuras_egresos
    WHERE user_id = v_user_id AND tipo_cupo = 'investment'
    ORDER BY estructura_id LIMIT 1;

    -- Parte del capital que NO se había retirado antes (el resto ya volvió
    -- a la billetera con los rescates parciales).
    v_por_acentrar := p_monto_total_retirado - v_ya_retirado;

    IF v_por_acentrar > 0 THEN
        INSERT INTO p_caja (
            user_id, tipo, billetera_origen_id, valor_ingreso,
            estructura_egreso_id, fecha, detalle, metadata
        ) VALUES (
            v_user_id, 'adjustment', p_billetera_destino_id, v_por_acentrar,
            v_categoria_inversion_id, CURRENT_DATE,
            'liquidation_capital_recovery: ' || v_inversion.nombre_activo,
            jsonb_build_object('inversion_id', p_inversion_id, 'es_rescate', true, 'investment_capital', true)
        )
        RETURNING p_caja_id INTO v_ingreso_id;
    END IF;

    -- Ganancia/pérdida contra el capital pendiente (lo que esta liquidación
    -- realmente cierra), no contra el capital original ya recuperado.
    v_ganancia_perdida := v_por_acentrar - (v_inversion.monto_invertido_original - v_ya_retirado);

    IF v_ganancia_perdida > 0 THEN
        INSERT INTO p_caja (
            user_id, tipo, billetera_origen_id, valor_ingreso,
            estructura_egreso_id, fecha, detalle, metadata
        ) VALUES (
            v_user_id, 'income', p_billetera_destino_id, v_ganancia_perdida,
            v_categoria_inversion_id, CURRENT_DATE,
            'liquidation_gain: ' || v_inversion.nombre_activo,
            jsonb_build_object('inversion_id', p_inversion_id, 'es_ganancia', true)
        );
    ELSIF v_ganancia_perdida < 0 THEN
        INSERT INTO p_caja (
            user_id, tipo, billetera_origen_id, valor_egreso,
            estructura_egreso_id, fecha, detalle, metadata
        ) VALUES (
            v_user_id, 'expense', p_billetera_destino_id, ABS(v_ganancia_perdida),
            v_categoria_inversion_id, CURRENT_DATE,
            'liquidation_loss: ' || v_inversion.nombre_activo,
            jsonb_build_object('inversion_id', p_inversion_id, 'es_perdida', true)
        );
    END IF;

    UPDATE p_inversiones
    SET estado = 'finalizada',
        monto_liquidado = p_monto_total_retirado,
        fecha_liquidacion = CURRENT_DATE,
        valor_mercado_actual = p_monto_total_retirado
    WHERE inversion_id = p_inversion_id;

    RETURN jsonb_build_object(
        'ganancia_perdida', v_ganancia_perdida,
        'monto_total_retirado', p_monto_total_retirado,
        'monto_acreditado', v_por_acentrar,
        'ya_retirado', v_ya_retirado
    );
END;
$function$;
