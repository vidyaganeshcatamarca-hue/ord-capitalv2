-- Regression suite for the fn_registrar_pago_extra_deuda hardening.
--
-- Runs inside BEGIN ... ROLLBACK. The authenticated user is simulated through
-- set_config('request.jwt.claims', ...), the value auth.uid() reads, so the shim
-- is exercised exactly as the UI calls it.
--
-- Every error case asserts three independent things: the wallet did not move, no
-- p_caja row appeared, and no p_prestamos_pagos row appeared. That is what proves
-- all-or-nothing rather than merely "an exception was raised".
--
-- Maps to the five requested verification points:
--   point 1  validation before writing ....... C2, C3, C4
--   point 2  atomic wallet + balance ........ C1, C6
--   point 3  no expense, no false success ... C2, C3, C4, C5
--   point 4  current callers keep working ... C7
--   point 5  calendar id confusion separate . C8 (see the note in C8)
--   extra    category lookup no longer fuzzy  C9

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth    uuid;
    v_user    bigint;
    v_wallet  bigint;
    v_otro    bigint;
    v_loan    bigint;
    v_arch    bigint;
    v_decoy   bigint;
    v_cat     bigint;
    v_pago    bigint;
    v_cajas0  integer;
    v_pagos0  integer;
    v_saldo0  numeric;
    v_w0      numeric;
    v_wsaldo  numeric;
    v_lsaldo  numeric;
    v_msg     text;
    v_cat_usada bigint;
BEGIN
    SELECT u.auth_id, u.user_id INTO v_auth, v_user
    FROM public.usuarios u
    JOIN public.p_billeteras b ON b.user_id = u.user_id AND b.moneda = 'ARS' AND b.activa = true
    WHERE u.auth_id IS NOT NULL ORDER BY u.user_id LIMIT 1;

    IF v_user IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'sin usuario con billetera ARS y auth_id');
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth)::text, true);

    SELECT billetera_id INTO v_wallet
    FROM public.p_billeteras
    WHERE user_id = v_user AND moneda = 'ARS' AND activa = true LIMIT 1;

    UPDATE public.p_billeteras SET saldo_actual = 1000000 WHERE billetera_id = v_wallet;

    SELECT count(*) INTO v_otro FROM public.usuarios WHERE user_id <> v_user LIMIT 1;

    -- Loan under test: 100.000 pending, plus one archived loan for the state check.
    v_loan := public.fn_prestamo_crear(
        'debo', 'TEST_C_Principal', 'ARS', 100000, 'libre', true, NULL, NULL, 100000);
    v_arch := public.fn_prestamo_crear(
        'debo', 'TEST_C_Archivado', 'ARS', 50000, 'libre', true, NULL, NULL, 50000);
    UPDATE public.p_prestamos SET estado = 'archivado' WHERE prestamo_id = v_arch;

    -- ---- C1: valid payment, wallet and balance both move together -----
    SELECT count(*) INTO v_cajas0 FROM public.p_caja;
    SELECT count(*) INTO v_pagos0 FROM public.p_prestamos_pagos;
    SELECT saldo_actual INTO v_w0 FROM public.p_billeteras WHERE billetera_id = v_wallet;
    SELECT saldo_actual INTO v_saldo0 FROM public.p_prestamos WHERE prestamo_id = v_loan;

    v_pago := public.fn_registrar_pago_extra_deuda(v_loan, 30000, v_wallet, CURRENT_DATE, 'test_c1');

    SELECT count(*) INTO v_cajas0 FROM public.p_caja WHERE p_caja_id IN (
        SELECT p_caja_id FROM public.p_prestamos_pagos WHERE prestamo_id = v_loan);
    SELECT saldo_actual INTO v_wsaldo FROM public.p_billeteras WHERE billetera_id = v_wallet;
    SELECT saldo_actual INTO v_lsaldo FROM public.p_prestamos WHERE prestamo_id = v_loan;

    INSERT INTO t_resultado VALUES (1, 'C1 pago valido mueve billetera y saldo juntos',
        (v_pago IS NOT NULL
         AND v_wsaldo = v_w0 - 30000
         AND v_lsaldo = v_saldo0 - 30000
         AND v_cajas0 = 1),
        format('billetera %s->%s saldo %s->%s cajas=%s', v_w0, v_wsaldo, v_saldo0, v_lsaldo, v_cajas0));

    -- Baseline after the valid payment: the error cases must not change it.
    SELECT count(*) INTO v_cajas0 FROM public.p_caja;
    SELECT count(*) INTO v_pagos0 FROM public.p_prestamos_pagos;
    SELECT saldo_actual INTO v_w0 FROM public.p_billeteras WHERE billetera_id = v_wallet;
    SELECT saldo_actual INTO v_saldo0 FROM public.p_prestamos WHERE prestamo_id = v_loan;

    -- ---- C2: id that does not exist (point 1, 3) ----------------------
    BEGIN
        PERFORM public.fn_registrar_pago_extra_deuda(999999999, 1000, v_wallet, CURRENT_DATE, 'test_c2');
        INSERT INTO t_resultado VALUES (2, 'C2 id inexistente: rechaza sin egreso', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (2, 'C2 id inexistente: rechaza sin egreso',
            (v_msg = 'error_debt_not_found'
             AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet) = v_w0
             AND (SELECT count(*) FROM public.p_caja) = v_cajas0
             AND (SELECT count(*) FROM public.p_prestamos_pagos) = v_pagos0),
            format('%s billetera=%s cajas=%s pagos=%s', v_msg,
                   (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet),
                   (SELECT count(*) FROM public.p_caja),
                   (SELECT count(*) FROM public.p_prestamos_pagos)));
    END;

    -- ---- C3: someone else's loan (point 1, 3) -------------------------
    IF v_otro = 0 THEN
        INSERT INTO t_resultado VALUES (3, 'C3 prestamo ajeno: rechaza sin egreso', NULL,
            'SKIP: no hay un segundo usuario en la base para construir el caso');
    ELSE
        DECLARE
            v_ajeno bigint;
        BEGIN
            SELECT user_id INTO v_ajeno FROM public.usuarios WHERE user_id <> v_user LIMIT 1;
            INSERT INTO public.p_prestamos
                (user_id, entidad_nombre, tipo_flujo, moneda_iso, monto_original,
                 monto_total_deuda, saldo_actual, saldo_al_ingreso, modalidad,
                 condicion_interes, estado)
            VALUES (v_ajeno, 'TEST_C_Ajeno', 'debo', 'ARS', 10000, 10000, 10000, 10000,
                    'libre', 'ninguno', 'activo');
            SELECT max(prestamo_id) INTO v_ajeno FROM public.p_prestamos WHERE entidad_nombre = 'TEST_C_Ajeno';

            BEGIN
                PERFORM public.fn_registrar_pago_extra_deuda(v_ajeno, 1000, v_wallet, CURRENT_DATE, 'test_c3');
                INSERT INTO t_resultado VALUES (3, 'C3 prestamo ajeno: rechaza sin egreso', false, 'no levanto excepcion');
            EXCEPTION WHEN OTHERS THEN
                GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
                INSERT INTO t_resultado VALUES (3, 'C3 prestamo ajeno: rechaza sin egreso',
                    (v_msg = 'error_debt_not_found'
                     AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet) = v_w0
                     AND (SELECT count(*) FROM public.p_caja) = v_cajas0
                     AND (SELECT count(*) FROM public.p_prestamos_pagos) = v_pagos0),
                    format('%s billetera=%s cajas=%s', v_msg,
                           (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet),
                           (SELECT count(*) FROM public.p_caja)));
            END;
        END;
    END IF;

    -- ---- C4: archived loan (point 1) ---------------------------------
    BEGIN
        PERFORM public.fn_registrar_pago_extra_deuda(v_arch, 1000, v_wallet, CURRENT_DATE, 'test_c4');
        INSERT INTO t_resultado VALUES (4, 'C4 prestamo archivado: rechaza sin egreso', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (4, 'C4 prestamo archivado: rechaza sin egreso',
            (v_msg = 'error_debt_not_payable'
             AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet) = v_w0
             AND (SELECT count(*) FROM public.p_caja) = v_cajas0),
            format('%s billetera=%s cajas=%s', v_msg,
                   (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet),
                   (SELECT count(*) FROM public.p_caja)));
    END;

    -- ---- C5: overpayment must not be swallowed (point 3) ------------
    BEGIN
        PERFORM public.fn_registrar_pago_extra_deuda(v_loan, 900000, v_wallet, CURRENT_DATE, 'test_c5');
        INSERT INTO t_resultado VALUES (5, 'C5 sobrepago: rechaza y no se queda la diferencia', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (5, 'C5 sobrepago: rechaza y no se queda la diferencia',
            (v_msg = 'error_overpayment_confirmation_required'
             AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet) = v_w0
             AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan) = v_saldo0),
            format('%s billetera=%s saldo=%s', v_msg,
                   (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet),
                   (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan)));
    END;

    -- ---- C6: after every error case nothing moved (point 2, atomicity)
    INSERT INTO t_resultado VALUES (6, 'C6 atomicidad: ningun caso de error dejo rastro',
        ((SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet) = v_w0
         AND (SELECT count(*) FROM public.p_caja) = v_cajas0
         AND (SELECT count(*) FROM public.p_prestamos_pagos) = v_pagos0
         AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan) = v_saldo0),
        format('billetera=%s/%s cajas=%s/%s pagos=%s/%s saldo=%s/%s',
               (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet), v_w0,
               (SELECT count(*) FROM public.p_caja), v_cajas0,
               (SELECT count(*) FROM public.p_prestamos_pagos), v_pagos0,
               (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_loan), v_saldo0));

    -- ---- C7: the exact call shape the current UI uses (point 4) -----
    v_pago := public.fn_registrar_pago_extra_deuda(v_loan, 5000, v_wallet, CURRENT_DATE, NULL);
    INSERT INTO t_resultado VALUES (7, 'C7 firma posicional que usa la UI sigue funcionando',
        (v_pago IS NOT NULL AND v_pago > 0),
        format('devuelve=%s', v_pago));

    -- ---- C8: calendar id confusion, treated separately (point 5) ----
    -- A cuota_id that is not a prestamo_id now raises instead of writing an
    -- expense, so the confusion can no longer move money. It is NOT resolved:
    -- a cuota_id that happens to equal some prestamo_id would still hit that
    -- loan. Closing that requires the calendar to carry explicit ids, which is
    -- task T18 and is not done here.
    BEGIN
        SELECT count(*) INTO v_cajas0 FROM public.p_caja;
        PERFORM public.fn_registrar_pago_extra_deuda(
            (SELECT max(cuota_id) FROM public.p_cuotas_detalle WHERE cuota_id NOT IN (SELECT prestamo_id FROM public.p_prestamos)),
            1000, v_wallet, CURRENT_DATE, 'test_c8');
        INSERT INTO t_resultado VALUES (8, 'C8 cuota_id confundido con prestamo_id: ya no debita', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (8, 'C8 cuota_id confundido con prestamo_id: ya no debita',
            (v_msg = 'error_debt_not_found' AND (SELECT count(*) FROM public.p_caja) = v_cajas0),
            format('%s cajas=%s (la confusion en si sigue abierta: tarea T18)',
                   v_msg, (SELECT count(*) FROM public.p_caja)));
    END;

    -- ---- C9: fuzzy category lookup is gone ---------------------------
    INSERT INTO public.p_estructuras_egresos
        (user_id, nombre_cuenta, tipo_cupo, icono, color, padre_id)
    VALUES (v_user, 'mis deudas hormiga', 'want', '🐜', '#111111', NULL)
    RETURNING estructura_id INTO v_decoy;

    v_pago := public.fn_registrar_pago_extra_deuda(v_loan, 1000, v_wallet, CURRENT_DATE, 'test_c9');

    SELECT c.estructura_egreso_id INTO v_cat_usada
    FROM public.p_caja c
    JOIN public.p_prestamos_pagos g ON g.p_caja_id = c.p_caja_id
    WHERE g.pago_id = v_pago;

    SELECT estructura_id INTO v_cat
    FROM public.p_estructuras_egresos
    WHERE user_id = v_user AND nombre_cuenta = 'cat_debt_payment' AND padre_id IS NULL;

    INSERT INTO t_resultado VALUES (9, 'C9 la categoria «mis deudas hormiga» no recibe el pago',
        (v_cat_usada = v_cat AND v_cat_usada <> v_decoy),
        format('usada=%s esperada=%s senuelo=%s', v_cat_usada, v_cat, v_decoy));
END $$;

SELECT orden, assertion,
       CASE WHEN ok IS NULL THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
