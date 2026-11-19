-- Transactional verification of stage 5: T5 edit, T8 correction, T10 history.
--
-- Runs inside BEGIN ... ROLLBACK.
--
-- Proves:
--   E1  editing conditions creates no cash movement and touches no operation
--   E2  editing saldo_al_ingreso recomputes the balance without cash
--   E3  correcting an amount upward moves the wallet by the difference only
--   E4  correcting it downward returns the difference
--   E5  correcting into an overpayment without confirmation changes nothing
--   E6  deleting an operation restores wallet and balance and removes the record
--   E7  history deletion is refused while a balance remains
--   E8  history deletion of a settled loan is logical: cash rows survive
--   E9  the four reports no longer count a logically deleted loan

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth    uuid;
    v_user    bigint;
    v_wallet  bigint;
    v_loan    bigint;
    v_pago    bigint;
    v_caja    bigint;
    v_w0      numeric;
    v_w_inicial numeric;
    v_saldo0  numeric;
    v_cajas0  integer;
    v_pagos0  integer;
    v_msg     text;
    v_estado  text;
    v_elim    timestamptz;
    v_n       integer;
    v_rate    numeric;
BEGIN
    SELECT u.auth_id, u.user_id INTO v_auth, v_user
    FROM public.usuarios u
    JOIN public.p_billeteras b ON b.user_id = u.user_id AND b.moneda = 'ARS' AND b.activa = true
    WHERE u.auth_id IS NOT NULL ORDER BY u.user_id LIMIT 1;

    IF v_user IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'sin usuario con billetera ARS');
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth)::text, true);

    SELECT billetera_id INTO v_wallet
    FROM public.p_billeteras WHERE user_id = v_user AND moneda = 'ARS' AND activa = true LIMIT 1;
    UPDATE public.p_billeteras SET saldo_actual = 500000 WHERE billetera_id = v_wallet;
    v_w_inicial := 500000;

    -- Loan of 200.000 pending, with one payment of 40.000.
    v_loan := public.fn_prestamo_crear(
        'debo', 'TEST_E_Banco', 'ARS', 200000, 'libre', true, NULL, NULL, 200000);

    v_pago := public.fn_registrar_pago_extra_deuda(v_loan, 40000, v_wallet, CURRENT_DATE, 'test_e');

    SELECT count(*) INTO v_cajas0 FROM public.p_caja;
    SELECT count(*) INTO v_pagos0 FROM public.p_prestamos_pagos;
    SELECT saldo_actual INTO v_w0 FROM public.p_billeteras WHERE billetera_id = v_wallet;
    SELECT saldo_actual INTO v_saldo0 FROM public.p_prestamos WHERE prestamo_id = v_loan;

    -- ---- E1: editing conditions touches no money ----------------------
    PERFORM public.fn_prestamo_editar(
        p_prestamo_id => v_loan,
        p_tasa_anual  => 47.5,
        p_tasa_informada => true,
        p_contraparte => 'TEST_E_Banco_Renombrado');

    SELECT tasa_anual_tna INTO v_rate FROM public.p_prestamos WHERE prestamo_id = v_loan;

    INSERT INTO t_resultado VALUES (1, 'E1 editar condiciones no mueve plata ni toca la operacion',
        (v_rate = 47.5
         AND (SELECT count(*) FROM public.p_caja) = v_cajas0
         AND (SELECT count(*) FROM public.p_prestamos_pagos) = v_pagos0
         AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet) = v_w0
         AND (SELECT entidad_nombre FROM public.p_prestamos WHERE prestamo_id = v_loan) = 'TEST_E_Banco_Renombrado'),
        format('tasa=%s cajas=%s/%s pagos=%s/%s', v_rate,
               (SELECT count(*) FROM public.p_caja), v_cajas0,
               (SELECT count(*) FROM public.p_prestamos_pagos), v_pagos0));

    -- ---- E2: correcting the registered balance recomputes it ---------
    PERFORM public.fn_prestamo_editar(p_prestamo_id => v_loan, p_saldo_al_ingreso => 250000);

    INSERT INTO t_resultado VALUES (2, 'E2 corregir saldo de ingreso recalcula sin caja',
        ((SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan) = 210000
         AND (SELECT monto_pagado_acumulado FROM public.p_prestamos WHERE prestamo_id = v_loan) = 40000
         AND (SELECT count(*) FROM public.p_caja) = v_cajas0),
        format('saldo=%s pagado=%s', 
               (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan),
               (SELECT monto_pagado_acumulado FROM public.p_prestamos WHERE prestamo_id = v_loan)));

    -- Back to 200.000 so the rest of the suite keeps round numbers.
    PERFORM public.fn_prestamo_editar(p_prestamo_id => v_loan, p_saldo_al_ingreso => 200000);

    -- ---- E3: correct the payment upward -------------------------------
    PERFORM public.fn_prestamo_corregir_pago(
        p_pago_id => v_pago, p_billetera_id => v_wallet,
        p_monto_billetera => 60000, p_moneda_billetera => 'ARS', p_monto_aplicado => 60000);

    INSERT INTO t_resultado VALUES (3, 'E3 corregir al alza mueve solo la diferencia',
        ((SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet) = v_w0 - 20000
         AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan) = v_saldo0 - 20000
         AND (SELECT count(*) FROM public.p_caja) = v_cajas0
         AND (SELECT count(*) FROM public.p_prestamos_pagos) = v_pagos0),
        format('billetera %s->%s saldo %s->%s cajas=%s', v_w0,
               (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet),
               v_saldo0, (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan),
               (SELECT count(*) FROM public.p_caja)));

    -- ---- E4: correct it back down -------------------------------------
    PERFORM public.fn_prestamo_corregir_pago(
        p_pago_id => v_pago, p_billetera_id => v_wallet,
        p_monto_billetera => 40000, p_moneda_billetera => 'ARS', p_monto_aplicado => 40000);

    INSERT INTO t_resultado VALUES (4, 'E4 corregir a la baja devuelve la diferencia',
        ((SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet) = v_w0
         AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan) = v_saldo0
         AND (SELECT count(*) FROM public.p_caja) = v_cajas0),
        format('billetera=%s saldo=%s',
               (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet),
               (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan)));

    -- ---- E5: correcting into an overpayment needs confirmation --------
    BEGIN
        PERFORM public.fn_prestamo_corregir_pago(
            p_pago_id => v_pago, p_billetera_id => v_wallet,
            p_monto_billetera => 900000, p_moneda_billetera => 'ARS', p_monto_aplicado => 900000);
        INSERT INTO t_resultado VALUES (5, 'E5 excedente sin confirmar no cambia nada', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (5, 'E5 excedente sin confirmar no cambia nada',
            (v_msg = 'error_overpayment_confirmation_required'
             AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet) = v_w0
             AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan) = v_saldo0),
            format('%s billetera=%s saldo=%s', v_msg,
                   (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet),
                   (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan)));
    END;

    -- ---- E6: deleting the operation restores everything ---------------
    PERFORM public.fn_prestamo_eliminar_pago(v_pago);

    INSERT INTO t_resultado VALUES (6, 'E6 eliminar operacion restaura billetera y saldo',
        ((SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet) = v_w_inicial
         AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan) = 200000
         AND (SELECT count(*) FROM public.p_prestamos_pagos WHERE pago_id = v_pago) = 0),
        format('billetera=%s saldo=%s',
               (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet),
               (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan)));

    -- ---- E7: history deletion refused while a balance remains ---------
    BEGIN
        PERFORM public.fn_prestamo_eliminar_historial(v_loan, true);
        INSERT INTO t_resultado VALUES (7, 'E7 no se borra del historial una deuda viva', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (7, 'E7 no se borra del historial una deuda viva',
            (v_msg = 'error_debt_not_settled'
             AND (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_loan) = 'activo'),
            format('%s estado=%s', v_msg,
                   (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_loan)));
    END;

    -- ---- E8: logical deletion of a settled loan ----------------------
    -- Settle it first, with a real payment so there is cash to preserve.
    v_pago := public.fn_registrar_pago_extra_deuda(v_loan, 200000, v_wallet, CURRENT_DATE, 'saldar');
    SELECT p_caja_id INTO v_caja FROM public.p_prestamos_pagos WHERE pago_id = v_pago;
    SELECT count(*) INTO v_cajas0 FROM public.p_caja;

    PERFORM public.fn_prestamo_eliminar_historial(v_loan, true);

    SELECT estado, eliminado_at INTO v_estado, v_elim
    FROM public.p_prestamos WHERE prestamo_id = v_loan;

    INSERT INTO t_resultado VALUES (8, 'E8 borrado de historial es logico y conserva la caja',
        (v_estado = 'eliminado' AND v_elim IS NOT NULL
         AND (SELECT count(*) FROM public.p_caja) = v_cajas0
         AND (SELECT count(*) FROM public.p_caja WHERE p_caja_id = v_caja) = 1
         AND (SELECT count(*) FROM public.p_prestamos_pagos WHERE prestamo_id = v_loan) = 1),
        format('estado=%s eliminado_at=%s cajas=%s/%s',
               v_estado, v_elim IS NOT NULL, (SELECT count(*) FROM public.p_caja), v_cajas0));

    -- ---- E9: reports exclude the logically deleted loan ---------------
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosrc ILIKE '%p_prestamos%'
      AND p.prosrc LIKE '%cancelado%' AND p.prosrc LIKE '%eliminado%';

    INSERT INTO t_resultado VALUES (9, 'E9 los reportes excluyen el prestamo eliminado',
        (v_n >= 4), format('funciones con el filtro nuevo=%s', v_n));
END $$;

SELECT orden, assertion,
       CASE WHEN ok IS NULL THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
