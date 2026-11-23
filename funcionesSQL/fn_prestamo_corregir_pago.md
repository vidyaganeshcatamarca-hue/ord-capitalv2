CREATE OR REPLACE FUNCTION public.fn_prestamo_corregir_pago(p_pago_id bigint, p_billetera_id bigint, p_monto_billetera numeric, p_moneda_billetera text, p_monto_aplicado numeric, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text, p_confirmar_excedente boolean DEFAULT false, p_capital_aplicado numeric DEFAULT NULL::numeric, p_interes_aplicado numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id   bigint;
    v_pago      public.p_prestamos_pagos%ROWTYPE;
    v_prestamo  public.p_prestamos%ROWTYPE;
    v_otros     numeric;
    v_base      numeric;
    v_aplicado  numeric;
    v_excedente numeric;
    v_tipo      text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    IF p_monto_billetera IS NULL OR p_monto_billetera <= 0
       OR p_monto_aplicado IS NULL OR p_monto_aplicado < 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;
    IF p_moneda_billetera IS NULL OR length(trim(p_moneda_billetera)) = 0 THEN
        RAISE EXCEPTION 'error_missing_required_fields';
    END IF;

    SELECT * INTO v_pago
    FROM public.p_prestamos_pagos
    WHERE pago_id = p_pago_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_payment_not_found';
    END IF;
    IF v_pago.estado <> 'activo' THEN
        RAISE EXCEPTION 'error_payment_not_active';
    END IF;

    SELECT * INTO v_prestamo
    FROM public.p_prestamos
    WHERE prestamo_id = v_pago.prestamo_id
    FOR UPDATE;

    PERFORM 1 FROM public.p_billeteras
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND activa = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_wallet_not_found';
    END IF;

    SELECT COALESCE(SUM(monto_aplicado), 0) INTO v_otros
    FROM public.p_prestamos_pagos
    WHERE prestamo_id = v_pago.prestamo_id AND estado = 'activo' AND pago_id <> p_pago_id;

    v_base := COALESCE(v_prestamo.saldo_al_ingreso, 0);
    v_aplicado := p_monto_aplicado;

    IF v_otros + v_aplicado > v_base THEN
        v_excedente := v_otros + v_aplicado - v_base;
        IF NOT COALESCE(p_confirmar_excedente, false) THEN
            RAISE EXCEPTION 'error_overpayment_confirmation_required';
        END IF;
        v_aplicado := GREATEST(0, v_base - v_otros);
    ELSE
        v_excedente := NULL;
    END IF;


    -- Decision 33A: same currency, so the wallet and the loan must agree. The excess of a
    -- confirmed overpayment is part of the identity, not an exception to it.
    IF upper(trim(p_moneda_billetera)) = upper(trim(v_prestamo.moneda_iso))
       AND p_monto_billetera <> v_aplicado + COALESCE(v_excedente, 0) THEN
        RAISE EXCEPTION 'error_monto_incoherente';
    END IF;

    v_tipo := CASE WHEN v_pago.direccion = 'cobro' THEN 'income' ELSE 'expense' END;

    -- Adjust the ORIGINAL cash row. The wallet trigger reverts OLD and applies NEW,
    -- so the balance moves by the difference only.
    UPDATE public.p_caja
       SET billetera_origen_id = p_billetera_id,
           valor_egreso  = CASE WHEN v_tipo = 'expense' THEN p_monto_billetera ELSE 0 END,
           valor_ingreso = CASE WHEN v_tipo = 'income'  THEN p_monto_billetera ELSE 0 END,
           fecha         = COALESCE(p_fecha, fecha),
           moneda        = trim(p_moneda_billetera),
           detalle       = COALESCE(p_nota, detalle)
     WHERE p_caja_id = v_pago.p_caja_id;

    UPDATE public.p_prestamos_pagos
       SET billetera_id        = p_billetera_id,
           moneda_billetera   = trim(p_moneda_billetera),
           monto_billetera    = p_monto_billetera,
           monto_aplicado     = v_aplicado,
           capital_aplicado   = COALESCE(p_capital_aplicado, capital_aplicado),
           interes_aplicado   = COALESCE(p_interes_aplicado, interes_aplicado),
           interes_excedente  = v_excedente,
           fecha              = COALESCE(p_fecha, fecha),
           nota               = COALESCE(p_nota, nota),
           corregido_at       = now()
     WHERE pago_id = p_pago_id;

    -- The p_prestamos_pagos trigger recomputes the loan balance.
END;
$function$
