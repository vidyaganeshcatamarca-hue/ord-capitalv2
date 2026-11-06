CREATE OR REPLACE FUNCTION public.fn_liquidar_inversion(
    p_inversion_id bigint,
    p_monto_total_retirado numeric,
    p_billetera_destino_id bigint
)
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

    SELECT estructura_id INTO v_categoria_inversion_id
    FROM p_estructuras_egresos
    WHERE user_id = v_user_id AND nombre_cuenta = 'cat_investments' AND tipo_cupo = 'investment'
    LIMIT 1;

    -- Devolver capital como ingreso en p_caja (billete destino)
    INSERT INTO p_caja (
        user_id, tipo, billetera_origen_id, valor_ingreso,
        estructura_egreso_id, fecha, detalle, metadata
    ) VALUES (
        v_user_id, 'income', p_billetera_destino_id, v_inversion.monto_invertido_original,
        v_categoria_inversion_id, CURRENT_DATE,
        'liquidation_capital_recovery: ' || v_inversion.nombre_activo,
        jsonb_build_object('inversion_id', p_inversion_id, 'es_rescate', true)
    )
    RETURNING p_caja_id INTO v_ingreso_id;

    -- Registrar ganancia o pérdida como ajuste
    v_ganancia_perdida := p_monto_total_retirado - v_inversion.monto_invertido_original;
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

    -- Marcar inversión como finalizada
    UPDATE p_inversiones
    SET estado = 'finalizada',
        monto_liquidado = p_monto_total_retirado,
        fecha_liquidacion = CURRENT_DATE,
        valor_mercado_actual = p_monto_total_retirado
    WHERE inversion_id = p_inversion_id;

    RETURN jsonb_build_object(
        'ganancia_perdida', v_ganancia_perdida,
        'monto_total_retirado', p_monto_total_retirado
    );
END;
$function$
