CREATE OR REPLACE FUNCTION public.fn_prestamo_registrar_pago(p_prestamo_id bigint, p_billetera_id bigint, p_monto_billetera numeric, p_moneda_billetera text, p_monto_aplicado numeric, p_fecha date DEFAULT CURRENT_DATE, p_nota text DEFAULT NULL::text, p_confirmar_excedente boolean DEFAULT false, p_capital_aplicado numeric DEFAULT NULL::numeric, p_interes_aplicado numeric DEFAULT NULL::numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id        bigint;
    v_hogar_id       bigint;
    v_prestamo       public.p_prestamos%ROWTYPE;
    v_direccion      text;
    v_saldo          numeric;
    v_aplicado       numeric;
    v_excedente      numeric;
    v_moneda_prestamo text;
    v_caja_id        bigint;
    v_pago_id        bigint;
    v_cat_id         bigint;
    v_ingreso_id     bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    IF p_monto_billetera IS NULL OR p_monto_billetera <= 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;
    IF p_monto_aplicado IS NULL OR p_monto_aplicado < 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;
    IF p_moneda_billetera IS NULL OR length(trim(p_moneda_billetera)) = 0 THEN
        RAISE EXCEPTION 'error_missing_required_fields';
    END IF;

    -- Lock the loan so two concurrent payments cannot both read the same balance.
    SELECT * INTO v_prestamo
    FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_debt_not_found';
    END IF;

    IF v_prestamo.estado NOT IN ('activo', 'pendiente', 'parcial', 'pagado') THEN
        RAISE EXCEPTION 'error_debt_not_payable';
    END IF;

    PERFORM 1
    FROM public.p_billeteras
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND activa = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_wallet_not_found';
    END IF;

    v_direccion       := CASE WHEN v_prestamo.tipo_flujo = 'me_deben' THEN 'cobro' ELSE 'pago' END;
    v_moneda_prestamo := trim(v_prestamo.moneda_iso);
    v_saldo           := COALESCE(v_prestamo.saldo_actual, 0);

    -- Overpayment: never clamped away, never inferred. Requires an explicit yes.
    IF p_monto_aplicado > v_saldo THEN
        v_excedente := p_monto_aplicado - v_saldo;
        IF NOT COALESCE(p_confirmar_excedente, false) THEN
            RAISE EXCEPTION 'error_overpayment_confirmation_required';
        END IF;
        v_aplicado := v_saldo;
    ELSE
        v_aplicado  := p_monto_aplicado;
        v_excedente := NULL;
    END IF;


    -- Decision 33A: same currency, so the wallet and the loan must agree. The excess of a
    -- confirmed overpayment is part of the identity, not an exception to it.
    IF upper(trim(p_moneda_billetera)) = upper(trim(v_prestamo.moneda_iso))
       AND p_monto_billetera <> v_aplicado + COALESCE(v_excedente, 0) THEN
        RAISE EXCEPTION 'error_monto_incoherente';
    END IF;

    -- The cash leg. 'expense' for a payment, 'income' for a collection, each with
    -- its own single category. Whole amount, once, in billetera_origen_id.
    IF v_direccion = 'pago' THEN
        v_cat_id := public.fn_prestamos_ensure_categoria_egreso(v_user_id, 'cat_debt_payment');

        INSERT INTO public.p_caja
            (user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
             fecha, moneda, estructura_egreso_id, detalle, metadata)
        VALUES
            (v_user_id, 'expense', p_billetera_id, p_monto_billetera, 0,
             COALESCE(p_fecha, CURRENT_DATE), p_moneda_billetera, v_cat_id,
             COALESCE(p_nota, 'prestamo_pago'),
             jsonb_build_object('prestamo_id', p_prestamo_id, 'origen', 'prestamos'))
        RETURNING p_caja_id INTO v_caja_id;
    ELSE
        v_ingreso_id := public.fn_prestamos_ensure_ingreso(v_user_id, 'loan_collection_income_name');

        INSERT INTO public.p_caja
            (user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
             fecha, moneda, cuenta_ingreso_id, detalle, metadata)
        VALUES
            (v_user_id, 'income', p_billetera_id, 0, p_monto_billetera,
             COALESCE(p_fecha, CURRENT_DATE), p_moneda_billetera, v_ingreso_id,
             COALESCE(p_nota, 'prestamo_cobro'),
             jsonb_build_object('prestamo_id', p_prestamo_id, 'origen', 'prestamos'))
        RETURNING p_caja_id INTO v_caja_id;
    END IF;

    INSERT INTO public.p_prestamos_pagos
        (prestamo_id, user_id, p_caja_id, direccion, fecha,
         billetera_id, moneda_billetera, monto_billetera,
         moneda_prestamo, monto_aplicado,
         capital_aplicado, interes_aplicado, interes_excedente, nota)
    VALUES
        (p_prestamo_id, v_user_id, v_caja_id, v_direccion, COALESCE(p_fecha, CURRENT_DATE),
         p_billetera_id, p_moneda_billetera, p_monto_billetera,
         v_moneda_prestamo, v_aplicado,
         p_capital_aplicado, p_interes_aplicado, v_excedente, p_nota)
    RETURNING pago_id INTO v_pago_id;

    -- The trigger recomputes saldo_actual, monto_pagado_acumulado and 'pagado'.

    RETURN v_pago_id;
END;
$function$
