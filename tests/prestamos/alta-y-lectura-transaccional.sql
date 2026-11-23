-- Transactional verification of stage 2: creation and the read model.
--
-- Runs inside BEGIN ... ROLLBACK. The authenticated user is simulated with
-- set_config('request.jwt.claims', ...), which is what auth.uid() reads, so the
-- RPCs are exercised through their real entry point instead of being bypassed
-- with direct inserts.
--
-- Proves:
--   B1  a new loan creates exactly ONE cash movement, as income for Debo
--   B2  a historical loan creates NO cash movement (AC-02)
--   B3  granting a loan creates an expense with its own category (AC-03)
--   B4  'cuotas' stores the schedule
--   B5  'cuotas' without a schedule is refused
--   B6  the summary never nets Debo against Me deben
--   B7  the list hides settled loans unless asked
--   B8  the detail returns one operation after a payment

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth      uuid;
    v_user      bigint;
    v_wallet    bigint;
    v_cajas_0   integer;
    v_cajas_1   integer;
    v_p_debo    bigint;
    v_p_hist    bigint;
    v_p_otorg   bigint;
    v_p_cuotas  bigint;
    v_saldo     numeric;
    v_base      numeric;
    v_estado    text;
    v_n         integer;
    v_res       jsonb;
    v_msg       text;
    v_pago      bigint;
BEGIN
    SELECT u.auth_id, u.user_id INTO v_auth, v_user
    FROM public.usuarios u
    JOIN public.p_billeteras b ON b.user_id = u.user_id AND b.moneda = 'ARS' AND b.activa = true
    WHERE u.auth_id IS NOT NULL
    LIMIT 1;

    IF v_user IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'no hay usuario con billetera ARS y auth_id');
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth)::text, true);

    SELECT billetera_id INTO v_wallet
    FROM public.p_billeteras
    WHERE user_id = v_user AND moneda = 'ARS' AND activa = true LIMIT 1;

    SELECT count(*) INTO v_cajas_0 FROM public.p_caja;

    -- ---- B1: new Debo loan of 500.000 --------------------------------
    v_p_debo := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_B1_Banco',
        p_moneda         => 'ARS',
        p_monto_original => 500000,
        p_modalidad      => 'vencimiento_unico',
        p_es_historico   => false,
        p_billetera_id   => v_wallet,
        p_monto_billetera=> 500000,
        p_proximo_vencimiento => CURRENT_DATE + 30,
        p_condicion_interes   => 'ninguno');

    SELECT count(*) INTO v_cajas_1 FROM public.p_caja;
    SELECT saldo_actual, saldo_al_ingreso, estado INTO v_saldo, v_base, v_estado
    FROM public.p_prestamos WHERE prestamo_id = v_p_debo;

    INSERT INTO t_resultado VALUES (1, 'B1 alta nueva: un solo movimiento de caja',
        (v_cajas_1 - v_cajas_0 = 1 AND v_saldo = 500000 AND v_base = 500000 AND v_estado = 'activo'),
        format('cajas +%s saldo=%s base=%s estado=%s', v_cajas_1 - v_cajas_0, v_saldo, v_base, v_estado));

    -- ---- B2: historical loan, original 500.000, today 180.000 ---------
    -- Fresh baseline: B1 already added its own movement, so comparing against the
    -- original count would blame B2 for B1's row.
    v_cajas_0 := v_cajas_1;
    v_p_hist := public.fn_prestamo_crear(
        p_direccion       => 'debo',
        p_contraparte     => 'TEST_B2_Historico',
        p_moneda          => 'ARS',
        p_monto_original  => 500000,
        p_modalidad       => 'libre',
        p_es_historico    => true,
        p_saldo_al_ingreso=> 180000);

    SELECT count(*) INTO v_cajas_1 FROM public.p_caja;
    SELECT saldo_actual, saldo_al_ingreso, monto_pagado_acumulado, estado
      INTO v_saldo, v_base, v_n, v_estado
    FROM public.p_prestamos WHERE prestamo_id = v_p_hist;

    INSERT INTO t_resultado VALUES (2, 'B2 historico: sin movimiento y sin pagos inferidos',
        (v_cajas_1 = v_cajas_0 AND v_saldo = 180000 AND v_base = 180000 AND v_n = 0),
        format('cajas +%s saldo=%s base=%s pagado=%s', v_cajas_1 - v_cajas_0, v_saldo, v_base, v_n));

    -- ---- B3: grant 50.000 to Juan --------------------------------
    v_p_otorg := public.fn_prestamo_crear(
        p_direccion      => 'me_deben',
        p_contraparte    => 'TEST_B3_Juan',
        p_moneda         => 'ARS',
        p_monto_original => 50000,
        p_modalidad      => 'libre',
        p_es_historico   => false,
        p_billetera_id   => v_wallet,
        p_monto_billetera=> 50000);

    SELECT count(*) INTO v_n
    FROM public.p_estructuras_egresos
    WHERE user_id = v_user AND nombre_cuenta = 'cat_loans_granted' AND padre_id IS NULL;
    INSERT INTO t_resultado VALUES (3, 'B3 otorgar: egreso con su categoria',
        (v_n = 1), format('categorias cat_loans_granted=%s', v_n));

    -- ---- B4: schedule of 3 installments ---------------------------
    v_p_cuotas := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_B4_Cuotas',
        p_moneda         => 'ARS',
        p_monto_original => 90000,
        p_modalidad      => 'cuotas',
        p_es_historico   => true,
        p_saldo_al_ingreso => 90000,
        p_cuotas => jsonb_build_array(
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 30, 'monto_cuota', 30000, 'interes_componente', 1000),
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 60, 'monto_cuota', 30000, 'interes_componente', 700),
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 90, 'monto_cuota', 30000, 'interes_componente', 300)));

    SELECT count(*) INTO v_n FROM public.p_prestamos_cuotas WHERE prestamo_id = v_p_cuotas;
    INSERT INTO t_resultado VALUES (4, 'B4 cronograma de 3 cuotas',
        (v_n = 3), format('cuotas=%s', v_n));

    -- ---- B5: cuotas without a schedule is refused -----------------
    BEGIN
        PERFORM public.fn_prestamo_crear(
            'debo', 'TEST_B5', 'ARS', 1000, 'cuotas', true, NULL, NULL, 1000);
        INSERT INTO t_resultado VALUES (5, 'B5 cuotas sin cronograma se rechaza', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (5, 'B5 cuotas sin cronograma se rechaza',
            (v_msg = 'error_schedule_required'), 'mensaje=' || v_msg);
    END;

    -- ---- B7: a settled loan leaves the active list ----------------
    INSERT INTO public.p_caja
        (user_id, tipo, billetera_origen_id, valor_egreso, fecha, moneda,
         estructura_egreso_id, detalle, metadata)
    VALUES (v_user, 'expense', v_wallet, 500000, CURRENT_DATE, 'ARS',
            public.fn_prestamos_ensure_categoria_egreso(v_user, 'cat_debt_payment'),
            'test_saldar', jsonb_build_object('prestamo_id', v_p_debo))
    RETURNING p_caja_id INTO v_pago;

    INSERT INTO public.p_prestamos_pagos
        (prestamo_id, user_id, p_caja_id, direccion, fecha, billetera_id,
         moneda_billetera, monto_billetera, moneda_prestamo, monto_aplicado)
    VALUES (v_p_debo, v_user, v_pago, 'pago', CURRENT_DATE, v_wallet, 'ARS', 500000, 'ARS', 500000);

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar('debo', false) l WHERE l.prestamo_id = v_p_debo;
    INSERT INTO t_resultado VALUES (6, 'B7 saldado fuera de la lista por defecto',
        (v_n = 0), format('aparece=%s', v_n));

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar('debo', true) l WHERE l.prestamo_id = v_p_debo;
    INSERT INTO t_resultado VALUES (7, 'B7 saldado aparece si se pide',
        (v_n = 1), format('aparece=%s', v_n));

    -- ---- B6: the summary keeps both directions apart --------------
    SELECT count(DISTINCT direccion) INTO v_n FROM public.fn_prestamos_resumen();
    INSERT INTO t_resultado VALUES (8, 'B6 resumen separa Debo y Me deben',
        (v_n = 2), format('direcciones=%s', v_n));

    -- ---- B8: the detail carries the operation ---------------------
    v_res := public.fn_prestamo_detalle(v_p_debo);
    INSERT INTO t_resultado VALUES (9, 'B8 detalle con operacion y estado',
        (jsonb_array_length(v_res->'pagos') = 1
         AND v_res->>'estado_vencimiento' = 'saldado'),
        format('pagos=%s estado_vto=%s', jsonb_array_length(v_res->'pagos'), v_res->>'estado_vencimiento'));
END $$;

SELECT orden, assertion, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado, detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
