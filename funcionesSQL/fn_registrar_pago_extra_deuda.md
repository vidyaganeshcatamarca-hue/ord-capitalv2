:
CREATE OR REPLACE FUNCTION public.fn_registrar_pago_extra_deuda(
    p_deuda_id bigint,
    p_monto numeric,
    p_billetera_origen_id bigint,
    p_fecha date DEFAULT CURRENT_DATE,
    p_nota text DEFAULT NULL::text
)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_caja_id bigint;
    v_categoria_deudas_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT estructura_id INTO v_categoria_deudas_id
    FROM public.p_estructuras_egresos
    WHERE user_id = v_user_id AND nombre_cuenta ILIKE '%deuda%' AND tipo_cupo = 'need'
    LIMIT 1;

    -- Si no existe, crear automáticamente la categoría de deudas
    IF v_categoria_deudas_id IS NULL THEN
        INSERT INTO public.p_estructuras_egresos (
            user_id, nombre_cuenta, tipo_cupo, descripcion, icono, color
        ) VALUES (
            v_user_id,
            'Pago de Deudas',
            'need',
            'Cuotas y pagos extras destinados a cancelar deudas',
            '💳',
            '#EF4444'
        )
        RETURNING estructura_id INTO v_categoria_deudas_id;
    END IF;

    INSERT INTO public.p_caja (
        user_id, tipo, billetera_origen_id, valor_egreso, fecha,
        estructura_egreso_id, detalle, metadata
    ) VALUES (
        v_user_id, 'expense', p_billetera_origen_id, p_monto, p_fecha,
        v_categoria_deudas_id, COALESCE(p_nota, 'extra_debt_payment'),
        jsonb_build_object('prestamo_id', p_deuda_id)
    )
    RETURNING p_caja_id INTO v_caja_id;

    UPDATE public.p_prestamos
    SET
        saldo_actual = GREATEST(0, saldo_actual - p_monto),
        monto_pagado_acumulado = COALESCE(monto_original, monto_total_deuda, 0) - GREATEST(0, saldo_actual - p_monto)
    WHERE prestamo_id = p_deuda_id AND user_id = v_user_id;

    RETURN v_caja_id;
END;
$function$
