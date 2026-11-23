-- Transactional verification of the stage 1b balance authority.
--
-- Everything runs inside BEGIN ... ROLLBACK: nothing is persisted, so it is safe
-- to run against the deployed database.
--
-- Proves:
--   A1  a payment recomputes saldo_actual and monto_pagado_acumulado
--   A2  reaching zero moves the loan to 'pagado'          (AC-07)
--   A3  voiding a payment reopens it to 'activo'          (S11)
--   A4  deleting the p_caja removes its operation and the balance is restored
--   A5  the wallet actually moves, exactly once, by the wallet amount
--   A6  the ensure_* helpers are idempotent (no duplicate category)
--   A7  the RPC refuses to write anything without an authenticated user

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden      integer,
    assertion  text,
    ok         boolean,
    detalle    text
) ON COMMIT DROP;

DO $$
DECLARE
    v_user      bigint;
    v_wallet    bigint;
    v_saldo_ini numeric;
    v_prestamo  bigint;
    v_caja      bigint;
    v_cat_a     bigint;
    v_cat_b     bigint;
    v_n_cats    integer;
    v_saldo     numeric;
    v_pagado    numeric;
    v_estado    text;
    v_saldo_w   numeric;
    v_msg       text;
BEGIN
    -- A real user with an ARS wallet, so the wallet trigger has something to move.
    SELECT u.user_id INTO v_user
    FROM public.usuarios u
    JOIN public.p_billeteras b ON b.user_id = u.user_id AND b.moneda = 'ARS' AND b.activa = true
    LIMIT 1;

    IF v_user IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'no hay usuario con billetera ARS');
        RETURN;
    END IF;

    SELECT b.billetera_id, b.saldo_actual INTO v_wallet, v_saldo_ini
    FROM public.p_billeteras b
    WHERE b.user_id = v_user AND b.moneda = 'ARS' AND b.activa = true
    LIMIT 1;

    -- ---- A6: ensure helpers are idempotent -------------------------------
    v_cat_a := public.fn_prestamos_ensure_categoria_egreso(v_user, 'cat_debt_payment');
    v_cat_b := public.fn_prestamos_ensure_categoria_egreso(v_user, 'cat_debt_payment');
    SELECT count(*) INTO v_n_cats
    FROM public.p_estructuras_egresos
    WHERE user_id = v_user AND nombre_cuenta = 'cat_debt_payment' AND padre_id IS NULL;
    INSERT INTO t_resultado VALUES (1, 'A6 ensure idempotente',
        (v_cat_a = v_cat_b AND v_n_cats = 1),
        format('ids=%s/%s filas=%s', v_cat_a, v_cat_b, v_n_cats));

    -- A loan of 100.000 with 100.000 pending, born inside ORD.
    INSERT INTO public.p_prestamos
        (user_id, entidad_nombre, tipo_flujo, moneda_iso, monto_original,
         monto_total_deuda, saldo_actual, saldo_al_ingreso, modalidad,
         condicion_interes, estado)
    VALUES
        (v_user, 'TEST_TRANSACCIONAL', 'debo', 'ARS', 100000, 100000, 100000, 100000,
         'libre', 'ninguno', 'activo')
    RETURNING prestamo_id INTO v_prestamo;

    -- ---- A1: first payment of 30.000 ------------------------------------
    INSERT INTO public.p_caja
        (user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
         fecha, moneda, estructura_egreso_id, detalle, metadata)
    VALUES
        (v_user, 'expense', v_wallet, 30000, 0, CURRENT_DATE, 'ARS', v_cat_a,
         'test_pago_1', jsonb_build_object('prestamo_id', v_prestamo))
    RETURNING p_caja_id INTO v_caja;

    INSERT INTO public.p_prestamos_pagos
        (prestamo_id, user_id, p_caja_id, direccion, fecha, billetera_id,
         moneda_billetera, monto_billetera, moneda_prestamo, monto_aplicado)
    VALUES
        (v_prestamo, v_user, v_caja, 'pago', CURRENT_DATE, v_wallet,
         'ARS', 30000, 'ARS', 30000);

    SELECT saldo_actual, monto_pagado_acumulado, estado
      INTO v_saldo, v_pagado, v_estado
    FROM public.p_prestamos WHERE prestamo_id = v_prestamo;
    INSERT INTO t_resultado VALUES (2, 'A1 saldo tras pago de 30000',
        (v_saldo = 70000 AND v_pagado = 30000 AND v_estado = 'activo'),
        format('saldo=%s pagado=%s estado=%s', v_saldo, v_pagado, v_estado));

    -- ---- A5: the wallet moved by the wallet amount ------------------------
    SELECT saldo_actual INTO v_saldo_w
    FROM public.p_billeteras WHERE billetera_id = v_wallet;
    INSERT INTO t_resultado VALUES (3, 'A5 billetera debitada una vez',
        (v_saldo_w = v_saldo_ini - 30000),
        format('antes=%s ahora=%s', v_saldo_ini, v_saldo_w));

    -- ---- A2: pay the rest, loan settles --------------------------------
    INSERT INTO public.p_caja
        (user_id, tipo, billetera_origen_id, valor_egreso, valor_ingreso,
         fecha, moneda, estructura_egreso_id, detalle, metadata)
    VALUES
        (v_user, 'expense', v_wallet, 70000, 0, CURRENT_DATE, 'ARS', v_cat_a,
         'test_pago_2', jsonb_build_object('prestamo_id', v_prestamo))
    RETURNING p_caja_id INTO v_caja;

    INSERT INTO public.p_prestamos_pagos
        (prestamo_id, user_id, p_caja_id, direccion, fecha, billetera_id,
         moneda_billetera, monto_billetera, moneda_prestamo, monto_aplicado)
    VALUES
        (v_prestamo, v_user, v_caja, 'pago', CURRENT_DATE, v_wallet,
         'ARS', 70000, 'ARS', 70000);

    SELECT saldo_actual, estado INTO v_saldo, v_estado
    FROM public.p_prestamos WHERE prestamo_id = v_prestamo;
    INSERT INTO t_resultado VALUES (4, 'A2 saldado automatico',
        (v_saldo = 0 AND v_estado = 'pagado'),
        format('saldo=%s estado=%s', v_saldo, v_estado));

    -- ---- A3: void the second payment, the loan reopens -------------------
    UPDATE public.p_prestamos_pagos
       SET estado = 'anulado'
     WHERE prestamo_id = v_prestamo AND monto_aplicado = 70000;

    SELECT saldo_actual, estado INTO v_saldo, v_estado
    FROM public.p_prestamos WHERE prestamo_id = v_prestamo;
    INSERT INTO t_resultado VALUES (5, 'A3 correccion reabre',
        (v_saldo = 70000 AND v_estado = 'activo'),
        format('saldo=%s estado=%s', v_saldo, v_estado));

    -- ---- A4: deleting the cash leg removes the operation -----------------
    BEGIN
        DELETE FROM public.p_caja
        WHERE p_caja_id = (
            SELECT p_caja_id FROM public.p_prestamos_pagos
            WHERE prestamo_id = v_prestamo AND monto_aplicado = 30000
        );

        SELECT saldo_actual, monto_pagado_acumulado, estado
          INTO v_saldo, v_pagado, v_estado
        FROM public.p_prestamos WHERE prestamo_id = v_prestamo;

        INSERT INTO t_resultado VALUES (6, 'A4 borrar p_caja restaura saldo',
            (v_saldo = 100000 AND v_pagado = 0),
            format('saldo=%s pagado=%s estado=%s', v_saldo, v_pagado, v_estado));
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO t_resultado VALUES (6, 'A4 borrar p_caja restaura saldo',
            false, 'bloqueado: ' || SQLERRM);
    END;

    -- ---- A7: without an authenticated user the RPC writes nothing --------
    BEGIN
        PERFORM public.fn_prestamo_registrar_pago(
            v_prestamo, v_wallet, 1000, 'ARS', 1000, CURRENT_DATE, 'test');
        INSERT INTO t_resultado VALUES (7, 'A7 RPC exige usuario autenticado',
            false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (7, 'A7 RPC exige usuario autenticado',
            (v_msg = 'error_unauthorized'), 'mensaje=' || v_msg);
    END;
END $$;

SELECT orden, assertion, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado, detalle
FROM t_resultado
ORDER BY orden;

ROLLBACK;
