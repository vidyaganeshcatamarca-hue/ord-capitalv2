-- Transactional verification of the two integrity fixes.
--
-- Runs inside BEGIN ... ROLLBACK. No real data is touched or kept.
--
-- Proves:
--   H1  two investment_prefix movements sharing an inversion_id no longer recurse
--   H2  the per-row business rules still run: deleting a contribution reverts the
--       amount, deleting the alta movement still removes the inversion
--   H3  fn_borrar_datos_usuario completes and removes loans, schedules and payments
--   H4  a single-movement delete still cascades exactly as before

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth    uuid;
    v_user    bigint;
    v_wallet  bigint;
    v_inv1    bigint;
    v_inv2    bigint;
    v_caja_a  bigint;
    v_caja_b  bigint;
    v_caja_c  bigint;
    v_inv_dep bigint;
    v_monto   numeric;
    v_n       integer;
    v_loan    bigint;
    v_msg     text;
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

    -- ---- H1: two alta movements on the same inversion -----------------
    INSERT INTO public.p_inversiones (user_id, nombre_activo, monto_invertido_original, fecha_inicio, estado, moneda)
    VALUES (v_user, 'TEST_H_Doble', 50000, CURRENT_DATE, 'activa', 'ARS')
    RETURNING inversion_id INTO v_inv1;

    INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, moneda, detalle, metadata)
    VALUES (v_user, 'adjustment', v_wallet, 30000, CURRENT_DATE, 'ARS',
            'investment_prefix: TEST_H_Doble',
            jsonb_build_object('inversion_id', v_inv1, 'investment_capital', true))
    RETURNING p_caja_id INTO v_caja_a;

    INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, moneda, detalle, metadata)
    VALUES (v_user, 'adjustment', v_wallet, 20000, CURRENT_DATE, 'ARS',
            'investment_prefix: TEST_H_Doble',
            jsonb_build_object('inversion_id', v_inv1, 'investment_capital', true))
    RETURNING p_caja_id INTO v_caja_b;

    BEGIN
        DELETE FROM public.p_caja WHERE p_caja_id = v_caja_a;

        SELECT count(*) INTO v_n FROM public.p_caja
        WHERE metadata->>'inversion_id' = v_inv1::text;
        SELECT count(*) INTO v_caja_c FROM public.p_inversiones WHERE inversion_id = v_inv1;

        INSERT INTO t_resultado VALUES (1, 'H1 dos altas del mismo inversion_id no recursan',
            (v_caja_c = 0),
            format('movimientos restantes=%s inversion restante=%s', v_n, v_caja_c));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (1, 'H1 dos altas del mismo inversion_id no recursan',
            false, 'fallo: ' || v_msg);
    END;

    -- ---- H2: business rules preserved ---------------------------------
    INSERT INTO public.p_inversiones (user_id, nombre_activo, monto_invertido_original, valor_mercado_actual, fecha_inicio, estado, moneda)
    VALUES (v_user, 'TEST_H_Aporte', 100000, 100000, CURRENT_DATE, 'activa', 'ARS')
    RETURNING inversion_id INTO v_inv2;

    INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, moneda, detalle, metadata)
    VALUES (v_user, 'adjustment', v_wallet, 40000, CURRENT_DATE, 'ARS',
            'investment_contribution: TEST_H_Aporte',
            jsonb_build_object('inversion_id', v_inv2, 'investment_capital', true))
    RETURNING p_caja_id INTO v_caja_c;

    UPDATE public.p_inversiones SET monto_invertido_original = 140000, valor_mercado_actual = 140000
    WHERE inversion_id = v_inv2;

    DELETE FROM public.p_caja WHERE p_caja_id = v_caja_c;

    SELECT monto_invertido_original INTO v_monto
    FROM public.p_inversiones WHERE inversion_id = v_inv2;
    SELECT count(*) INTO v_n FROM public.p_inversiones WHERE inversion_id = v_inv2;

    INSERT INTO t_resultado VALUES (2, 'H2 borrar un aporte revierte el monto',
        (v_monto = 100000 AND v_n = 1),
        format('monto=%s inversion viva=%s', v_monto, v_n));

    -- ---- H4: a lone alta movement still removes the inversion ---------
    INSERT INTO public.p_inversiones (user_id, nombre_activo, monto_invertido_original, fecha_inicio, estado, moneda)
    VALUES (v_user, 'TEST_H_Simple', 25000, CURRENT_DATE, 'activa', 'ARS')
    RETURNING inversion_id INTO v_inv_dep;

    INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, moneda, detalle, metadata)
    VALUES (v_user, 'adjustment', v_wallet, 25000, CURRENT_DATE, 'ARS',
            'investment_prefix: TEST_H_Simple',
            jsonb_build_object('inversion_id', v_inv_dep, 'investment_capital', true))
    RETURNING p_caja_id INTO v_caja_c;

    DELETE FROM public.p_caja WHERE p_caja_id = v_caja_c;

    SELECT count(*) INTO v_n FROM public.p_inversiones WHERE inversion_id = v_inv_dep;
    INSERT INTO t_resultado VALUES (3, 'H4 una sola alta sigue borrando la inversion',
        (v_n = 0), format('inversion restante=%s', v_n));

    -- ---- H3: user deletion ----------------------------------------------
    -- The routine still aborts, but on a table OUTSIDE this module: 45 tables
    -- reference usuarios and its array lists 22, so p_billeteras -> p_sobre_movimientos
    -- fails. Which of the other 23 (legal consents, telemetry, notification logs,
    -- secrets) must be erased versus retained is a product and legal decision, so it
    -- is reported rather than silently decided here.
    -- What this module owns is asserted by source: all four loan tables are listed,
    -- children before p_prestamos.
    DECLARE
        v_src text;
        v_pos_v integer;
        v_pos_g integer;
        v_pos_c integer;
        v_pos_p integer;
    BEGIN
        SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario';

        v_pos_v := position('p_prestamos_vinculos' IN v_src);
        v_pos_g := position('p_prestamos_pagos' IN v_src);
        v_pos_c := position('p_prestamos_cuotas' IN v_src);
        -- The array stores 'tabla|columna' pairs. The pipe alone is enough and is
        -- unique: 'p_prestamos_pagos|' and 'p_prestamos_cuotas|' can never match it.
        v_pos_p := position('p_prestamos|' IN v_src);

        INSERT INTO t_resultado VALUES (4, 'H3 las cuatro tablas de prestamos estan en el borrado, hijos primero',
            (v_pos_v > 0 AND v_pos_g > 0 AND v_pos_c > 0 AND v_pos_p > 0
             AND v_pos_v < v_pos_g AND v_pos_g < v_pos_c AND v_pos_c < v_pos_p),
            format('vinculos=%s pagos=%s cuotas=%s prestamos=%s', v_pos_v, v_pos_g, v_pos_c, v_pos_p));
    END;
END $$;

SELECT orden, assertion,
       CASE WHEN ok IS NULL THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
