-- Transactional verification of T18: explicit calendar identifiers for loans.
--
-- Runs inside BEGIN ... ROLLBACK.
--
-- Proves:
--   D1  the deployed legacy function no longer builds a loan id out of a cuota id
--   D2  fn_prestamos_calendario carries prestamo_id and cuota_id as separate,
--       non-null, distinct columns
--   D3  the installment 'pagado' flag is derived from cumulative amounts
--   D4  both directions are represented, so a receivable is never shown as a debt
--   D5  paying through the explicit prestamo_id reduces exactly that loan
--   D6  settled loans leave the calendar
--
-- What D2 and D5 do NOT prove: that a collision between a cuota id and another
-- loan's id is impossible. It is entirely possible, which is precisely why the
-- consumer must read prestamo_id from a column instead of parsing a string. The
-- suite asserts the separation, not the absence of collisions.

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth      uuid;
    v_user      bigint;
    v_wallet    bigint;
    v_debo      bigint;
    v_otorg     bigint;
    v_cuota_1   bigint;
    v_prest_col bigint;
    v_cuota_col bigint;
    v_pagado    boolean;
    v_dir       text;
    v_n         integer;
    v_msg       text;
    v_pago      bigint;
    v_saldo     numeric;
    v_legacy    text;
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
    FROM public.p_billeteras WHERE user_id = v_user AND moneda = 'ARS' AND activa = true LIMIT 1;

    -- ---- D1: the legacy body no longer claims a loan id ------------------
    SELECT pg_get_functiondef(p.oid) INTO v_legacy
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_reporte_calendario_financiero';

    INSERT INTO t_resultado VALUES (1, 'D1 el calendario viejo ya no disfraza un cuota_id de prestamo_id',
        (position('''cuota_prestamo_'' || cd.cuota_id' IN v_legacy) > 0
         AND position('''prestamo_'' || cd.cuota_id' IN v_legacy) = 0),
        format('cuota_prestamo_=%s prestamo_=%s',
               position('''cuota_prestamo_'' || cd.cuota_id' IN v_legacy),
               position('''prestamo_'' || cd.cuota_id' IN v_legacy)));

    -- ---- Fixtures -------------------------------------------------------
    v_debo := public.fn_prestamo_crear(
        p_direccion => 'debo', p_contraparte => 'TEST_D_Banco', p_moneda => 'ARS',
        p_monto_original => 90000, p_modalidad => 'cuotas', p_es_historico => true,
        p_saldo_al_ingreso => 90000,
        p_cuotas => jsonb_build_array(
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE - 5,  'monto_cuota', 30000, 'interes_componente', 900),
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 25, 'monto_cuota', 30000, 'interes_componente', 600),
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 55, 'monto_cuota', 30000, 'interes_componente', 300)));

    v_otorg := public.fn_prestamo_crear(
        p_direccion => 'me_deben', p_contraparte => 'TEST_D_Juan', p_moneda => 'ARS',
        p_monto_original => 40000, p_modalidad => 'cuotas', p_es_historico => true,
        p_saldo_al_ingreso => 40000,
        p_cuotas => jsonb_build_array(
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 10, 'monto_cuota', 20000),
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 40, 'monto_cuota', 20000)));

    -- ---- D2: ids come in columns, not in a string -----------------------
    SELECT c.prestamo_id, c.cuota_id INTO v_prest_col, v_cuota_col
    FROM public.fn_prestamos_calendario(400) c
    WHERE c.prestamo_id = v_debo
    ORDER BY c.numero_cuota LIMIT 1;

    INSERT INTO t_resultado VALUES (2, 'D2 ids explicitos y distintos por columna',
        (v_prest_col IS NOT NULL AND v_cuota_col IS NOT NULL AND v_prest_col <> v_cuota_col),
        format('prestamo_id=%s cuota_id=%s', v_prest_col, v_cuota_col));

    -- ---- D3: 'pagado' is derived, so the overdue installment is unpaid ---
    SELECT c.pagado INTO v_pagado
    FROM public.fn_prestamos_calendario(400) c
    WHERE c.prestamo_id = v_debo ORDER BY c.numero_cuota LIMIT 1;

    INSERT INTO t_resultado VALUES (3, 'D3 sin pagos, la cuota vencida figura impaga',
        (v_pagado = false), format('pagado=%s', v_pagado));

    -- ---- D4: both directions present -----------------------------------
    SELECT count(DISTINCT c.direccion) INTO v_n
    FROM public.fn_prestamos_calendario(400) c
    WHERE c.prestamo_id IN (v_debo, v_otorg);

    INSERT INTO t_resultado VALUES (4, 'D4 el calendario distingue a pagar de a cobrar',
        (v_n = 2), format('direcciones=%s', v_n));

    -- ---- D5: paying through the explicit prestamo_id hits that loan -----
    SELECT saldo_actual INTO v_saldo FROM public.p_prestamos WHERE prestamo_id = v_debo;

    SELECT c.prestamo_id INTO v_prest_col
    FROM public.fn_prestamos_calendario(400) c
    WHERE c.prestamo_id = v_debo ORDER BY c.numero_cuota LIMIT 1;

    v_pago := public.fn_registrar_pago_extra_deuda(v_prest_col, 30000, v_wallet, CURRENT_DATE, 'test_d5');

    INSERT INTO t_resultado VALUES (5, 'D5 pagar con el prestamo_id explicito reduce ese prestamo',
        (v_pago IS NOT NULL
         AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_debo) = v_saldo - 30000),
        format('saldo %s -> %s', v_saldo,
               (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_debo)));

    -- ---- D3b: now the first installment is covered ----------------------
    SELECT c.pagado INTO v_pagado
    FROM public.fn_prestamos_calendario(400) c
    WHERE c.prestamo_id = v_debo ORDER BY c.numero_cuota LIMIT 1;

    INSERT INTO t_resultado VALUES (6, 'D3 pago libre marca cubierta la cuota vencida',
        (v_pagado = true), format('pagado=%s', v_pagado));

    -- ---- D6: settled leaves the calendar -------------------------------
    PERFORM public.fn_registrar_pago_extra_deuda(v_debo, 60000, v_wallet, CURRENT_DATE, 'test_d6');

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_calendario(400) c WHERE c.prestamo_id = v_debo;

    INSERT INTO t_resultado VALUES (7, 'D6 prestamo saldado sale del calendario',
        (v_n = 0), format('eventos=%s saldo=%s', v_n,
               (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_debo)));

    -- ---- D5b: passing a cuota_id as a loan id is still rejected ---------
    BEGIN
        PERFORM public.fn_registrar_pago_extra_deuda(v_cuota_col, 1000, v_wallet, CURRENT_DATE, 'test_d5b');
        INSERT INTO t_resultado VALUES (8, 'D5b un cuota_id crudo no se acepta como prestamo_id', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (8, 'D5b un cuota_id crudo no se acepta como prestamo_id',
            (v_msg = 'error_debt_not_found'), 'mensaje=' || v_msg);
    END;
END $$;

SELECT orden, assertion,
       CASE WHEN ok IS NULL THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
