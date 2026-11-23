-- Transactional verification of T30 / S31: co-ownership reaches the write layer.
--
-- Runs inside BEGIN ... ROLLBACK with throwaway users created here. No real user's
-- rows are read or locked, and no wallet of a real user is touched.
--
-- The rule under test, the read side's predicate, unchanged:
--
--       (row.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND row.hogar_id = v_hogar_id))
--
-- Proves:
--   W1  B, the other member of the household, may edit the conditions of the co-owned
--       loan, may pay it from B's own wallet, may correct that payment, may delete it,
--       and may remove the loan from the history. No action is reserved to A, the
--       creator of the row.
--   W2  B may not touch A's private loan through any of those calls: each one raises,
--       none of them is a silent no-op.
--   W3  payer attribution: the payment B registers records B as user_id, B's wallet,
--       and a p_caja row owned by B; the money leaves B's wallet and A's stays intact.
--       The loan's owner does not change.
--   W4  the ledger does not lie: the loan's outstanding balance drops exactly once per
--       payment, and the recorded operation names B as the payer.
--   W5  deletion of the co-owned loan from the history is bilateral: it disappears for
--       both members, and no permission prevents it.
--   W6  a caller with no household selects exactly what the old predicate selected, over
--       the whole table. A caller in a different household selects exactly its own rows.
--       That is the no-regression guarantee.
--   S   the audited list is complete and the two payment operations that were
--       deliberately NOT widened are still payer-scoped.

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth_a uuid := gen_random_uuid();
    v_auth_b uuid := gen_random_uuid();
    v_auth_c uuid := gen_random_uuid();
    v_auth_d uuid := gen_random_uuid();
    v_a     bigint;
    v_b     bigint;
    v_c     bigint;
    v_d     bigint;
    v_hogar_ab  bigint;
    v_hogar_d   bigint;
    v_wallet_a  bigint;
    v_wallet_b  bigint;
    v_wallet_c  bigint;
    v_wallet_d  bigint;
    v_privado   bigint;
    v_compart   bigint;
    v_propio_c  bigint;
    v_propio_d  bigint;
    v_pago_a    bigint;
    v_pago_b    bigint;
    v_saldo     numeric;
    v_pagado    numeric;
    v_dueno     bigint;
    v_payer     bigint;
    v_wallet    bigint;
    v_caja      bigint;
    v_moneda    text;
    v_msg       text;
    v_n         integer;
    v_m         integer;
    v_puntos    smallint;
    -- snapshots taken before a block of calls that must change nothing
    v_cajas0    integer;
    v_pagos0    integer;
    v_prest0    integer;
    v_wa0       numeric;
    v_wb0       numeric;
    v_saldo0    numeric;
    -- the caller's household, derived the way the functions derive it
    v_hogar_c   bigint;
    v_viejo     integer;
    v_nuevo     integer;
    v_dif       integer;
    v_total     integer;
BEGIN
    -- =======================================================================
    -- fixture: A and B share household AB; C belongs to none; D belongs to
    -- another household. Every row below is created by this block.
    -- =======================================================================
    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_a, 'TEST_ESC_A', 'test_esc_a_' || left(replace(v_auth_a::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_a;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_b, 'TEST_ESC_B', 'test_esc_b_' || left(replace(v_auth_b::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_b;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_c, 'TEST_ESC_C', 'test_esc_c_' || left(replace(v_auth_c::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_c;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_d, 'TEST_ESC_D', 'test_esc_d_' || left(replace(v_auth_d::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_d;

    IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL OR v_d IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'no se pudieron crear los usuarios descartables');
        RETURN;
    END IF;

    -- Wallets carry a known balance so every movement is visible as a number.
    INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual)
    VALUES (v_a, 'TEST_ESC_WalletA', 'ARS', 100000) RETURNING billetera_id INTO v_wallet_a;
    INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual)
    VALUES (v_b, 'TEST_ESC_WalletB', 'ARS', 50000) RETURNING billetera_id INTO v_wallet_b;
    INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual)
    VALUES (v_c, 'TEST_ESC_WalletC', 'ARS', 10000) RETURNING billetera_id INTO v_wallet_c;
    INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual)
    VALUES (v_d, 'TEST_ESC_WalletD', 'ARS', 5000) RETURNING billetera_id INTO v_wallet_d;

    INSERT INTO public.p_hogares (nombre_hogar, porcentaje_usuario_creador, porcentaje_usuario_invitado)
    VALUES ('TEST_ESC_HogarAB', 50, 50) RETURNING hogar_id INTO v_hogar_ab;
    INSERT INTO public.p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar_ab, v_a, 'creador'), (v_hogar_ab, v_b, 'invitado');

    INSERT INTO public.p_hogares (nombre_hogar, porcentaje_usuario_creador, porcentaje_usuario_invitado)
    VALUES ('TEST_ESC_HogarD', 50, 50) RETURNING hogar_id INTO v_hogar_d;
    INSERT INTO public.p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar_d, v_d, 'creador');

    -- A: one private loan and one co-owned by AB. Both historical, so creation moves
    -- no money and every later movement is unambiguous.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    v_privado := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_ESC_PrivadoA',
        p_moneda         => 'ARS',
        p_monto_original => 1000,
        p_modalidad      => 'libre',
        p_es_historico   => true);

    v_compart := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_ESC_Compartido',
        p_moneda         => 'ARS',
        p_monto_original => 2000,
        p_modalidad      => 'libre',
        p_es_historico   => true,
        p_hogar_id       => v_hogar_ab);

    -- A payment by A on A's own private loan, so the negative payment cases have a real
    -- operation to aim at.
    v_pago_a := public.fn_prestamo_registrar_pago(
        p_prestamo_id     => v_privado,
        p_billetera_id    => v_wallet_a,
        p_monto_billetera => 100,
        p_moneda_billetera => 'ARS',
        p_monto_aplicado  => 100);

    -- C, who belongs to no household, and D, who belongs to another one.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_c)::text, true);
    v_propio_c := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_ESC_PropioC',
        p_moneda         => 'ARS',
        p_monto_original => 700,
        p_modalidad      => 'libre',
        p_es_historico   => true);

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_d)::text, true);
    v_propio_d := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_ESC_PropioD',
        p_moneda         => 'ARS',
        p_monto_original => 400,
        p_modalidad      => 'libre',
        p_es_historico   => true);

    INSERT INTO t_resultado VALUES (1, 'setup: A con un prestamo privado (saldo 900) y uno coposeido (2000), C sin hogar y D en otro hogar',
        (v_privado IS NOT NULL AND v_compart IS NOT NULL AND v_propio_c IS NOT NULL
         AND v_propio_d IS NOT NULL AND v_pago_a IS NOT NULL
         AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_privado) = 900),
        format('privado=%s saldo=%s compartido=%s propio_c=%s propio_d=%s',
               v_privado, (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_privado),
               v_compart, v_propio_c, v_propio_d));

    -- =======================================================================
    -- W1 / W3 / W4 — B operates on the co-owned loan
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);

    SELECT count(*) INTO v_cajas0 FROM public.p_caja;
    v_wa0 := (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_a);
    v_wb0 := (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_b);

    -- W1: edit the conditions of somebody else's row, because it is also B's debt.
    BEGIN
        PERFORM public.fn_prestamo_editar(
            p_prestamo_id    => v_compart,
            p_contraparte    => 'TEST_ESC_Compartido_por_B',
            p_tasa_anual     => 12.5,
            p_tasa_informada => true);

        SELECT count(*) INTO v_n FROM public.p_prestamos
        WHERE prestamo_id = v_compart
          AND entidad_nombre = 'TEST_ESC_Compartido_por_B'
          AND tasa_anual_tna = 12.5
          AND tasa_informada = true
          AND user_id = v_a;
        INSERT INTO t_resultado VALUES (2, 'W1 editar: B edita las condiciones de la deuda coposeida, sin caja y con A como dueno',
            (v_n = 1 AND (SELECT count(*) FROM public.p_caja) = v_cajas0),
            format('filas=%s cajas=%s/%s', v_n, (SELECT count(*) FROM public.p_caja), v_cajas0));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (2, 'W1 editar: B edita las condiciones de la deuda coposeida, sin caja y con A como dueno',
            false, 'mensaje=' || v_msg);
    END;

    -- Editing conditions is not a payment: no money, no operation.
    SELECT count(*) INTO v_n FROM public.p_prestamos
    WHERE prestamo_id = v_compart AND saldo_actual = 2000 AND monto_pagado_acumulado = 0;
    INSERT INTO t_resultado VALUES (3, 'W1 editar: editar condiciones no mueve plata ni registra una operacion',
        (v_n = 1
         AND (SELECT count(*) FROM public.p_prestamos_pagos WHERE prestamo_id = v_compart) = 0
         AND (SELECT count(*) FROM public.p_caja) = v_cajas0
         AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_a) = v_wa0),
        format('saldo=2000 pagado=0 pagos=%s cajas=%s/%s',
               (SELECT count(*) FROM public.p_prestamos_pagos WHERE prestamo_id = v_compart),
               (SELECT count(*) FROM public.p_caja), v_cajas0));

    -- W2: the same call against A's private loan must raise, not no-op.
    BEGIN
        PERFORM public.fn_prestamo_editar(v_privado, p_contraparte => 'TEST_ESC_Intruso');
        INSERT INTO t_resultado VALUES (4, 'W2 editar: B no edita la deuda privada de A', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (4, 'W2 editar: B no edita la deuda privada de A',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- W3: B registers a payment from B's own wallet.
    BEGIN
        v_pago_b := public.fn_prestamo_registrar_pago(
            p_prestamo_id      => v_compart,
            p_billetera_id     => v_wallet_b,
            p_monto_billetera  => 500,
            p_moneda_billetera => 'ARS',
            p_monto_aplicado   => 500);
        INSERT INTO t_resultado VALUES (5, 'W1 registrar pago: B paga la deuda coposeida desde su propia billetera',
            (v_pago_b IS NOT NULL), format('pago=%s', v_pago_b));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        v_pago_b := NULL;
        INSERT INTO t_resultado VALUES (5, 'W1 registrar pago: B paga la deuda coposeida desde su propia billetera',
            false, 'mensaje=' || v_msg);
    END;

    SELECT pg.user_id, pg.billetera_id, pg.monto_billetera, pg.monto_aplicado,
           pg.moneda_billetera, pg.p_caja_id
      INTO v_payer, v_wallet, v_saldo, v_m, v_moneda, v_caja
    FROM public.p_prestamos_pagos pg WHERE pg.pago_id = v_pago_b;

    INSERT INTO t_resultado VALUES (6, 'W3 atribucion: el pago registra a B como pagador, la billetera de B y su moneda',
        (v_pago_b IS NOT NULL AND v_payer = v_b AND v_wallet = v_wallet_b
         AND v_saldo = 500 AND v_m = 500 AND trim(v_moneda) = 'ARS'),
        format('pago_user_id=%s (esperado B=%s) billetera=%s (esperado %s) montos=%s/%s moneda=%s',
               v_payer, v_b, v_wallet, v_wallet_b, v_saldo, v_m, v_moneda));

    SELECT count(*) INTO v_n FROM public.p_caja
    WHERE p_caja_id = v_caja AND user_id = v_b
      AND billetera_origen_id = v_wallet_b AND valor_egreso = 500 AND tipo = 'expense';
    INSERT INTO t_resultado VALUES (7, 'W3 atribucion: el movimiento de caja es de B y sale de la billetera de B',
        (v_n = 1), format('filas de caja de B=%s', v_n));

    INSERT INTO t_resultado VALUES (8, 'W3 atribucion: la plata sale de la billetera de B y la de A queda intacta',
        ((SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_b) = v_wb0 - 500
         AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_a) = v_wa0),
        format('billetera B %s->%s  billetera A %s->%s', v_wb0,
               (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_b),
               v_wa0,
               (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_a)));

    -- W4: the balance drops once, and the row keeps A as its owner.
    SELECT saldo_actual, monto_pagado_acumulado, user_id
      INTO v_saldo, v_pagado, v_dueno
    FROM public.p_prestamos WHERE prestamo_id = v_compart;

    INSERT INTO t_resultado VALUES (9, 'W4 balance: el saldo coposeido baja una sola vez y A sigue siendo el dueno de la fila',
        (v_saldo = 1500 AND v_pagado = 500 AND v_dueno = v_a),
        format('saldo=%s (esperado 1500) pagado=%s (esperado 500) dueno=%s', v_saldo, v_pagado, v_dueno));

    -- W2: B cannot pay A's private loan.
    BEGIN
        PERFORM public.fn_prestamo_registrar_pago(
            p_prestamo_id      => v_privado,
            p_billetera_id     => v_wallet_b,
            p_monto_billetera  => 10,
            p_moneda_billetera => 'ARS',
            p_monto_aplicado   => 10);
        INSERT INTO t_resultado VALUES (10, 'W2 registrar pago: B no paga la deuda privada de A', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (10, 'W2 registrar pago: B no paga la deuda privada de A',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- The wallet is still the caller's, never the debt owner's.
    SELECT count(*) INTO v_pagos0 FROM public.p_prestamos_pagos;
    v_saldo0 := (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_compart);
    BEGIN
        PERFORM public.fn_prestamo_registrar_pago(
            p_prestamo_id      => v_compart,
            p_billetera_id     => v_wallet_a,
            p_monto_billetera  => 50,
            p_moneda_billetera => 'ARS',
            p_monto_aplicado   => 50);
        INSERT INTO t_resultado VALUES (11, 'W3 billetera: B no puede pagar la deuda coposeida con la billetera de A', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (11, 'W3 billetera: B no puede pagar la deuda coposeida con la billetera de A',
            (v_msg LIKE '%error_wallet_not_found%'
             AND (SELECT count(*) FROM public.p_prestamos_pagos) = v_pagos0
             AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_compart) = v_saldo0
             AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_a) = v_wa0),
            format('%s pagos=%s/%s saldo=%s billeteraA=%s',
                   v_msg, (SELECT count(*) FROM public.p_prestamos_pagos), v_pagos0,
                   (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_compart),
                   (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_a)));
    END;

    -- W1: B corrects the payment B registered.
    BEGIN
        PERFORM public.fn_prestamo_corregir_pago(
            p_pago_id          => v_pago_b,
            p_billetera_id     => v_wallet_b,
            p_monto_billetera  => 700,
            p_moneda_billetera => 'ARS',
            p_monto_aplicado   => 700);
        INSERT INTO t_resultado VALUES (12, 'W1 corregir: B corrige su propio pago sobre la deuda coposeida',
            ((SELECT count(*) FROM public.p_prestamos_pagos
              WHERE pago_id = v_pago_b AND monto_aplicado = 700) = 1),
            format('pago aplicado=%s',
                   (SELECT monto_aplicado FROM public.p_prestamos_pagos WHERE pago_id = v_pago_b)));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (12, 'W1 corregir: B corrige su propio pago sobre la deuda coposeida', false, 'mensaje=' || v_msg);
    END;

    INSERT INTO t_resultado VALUES (13, 'W4 correccion: se mueve solo la diferencia y el saldo baja una sola vez',
        ((SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_b) = v_wb0 - 700
         AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_compart) = 1300
         AND (SELECT count(*) FROM public.p_prestamos_pagos WHERE prestamo_id = v_compart) = 1),
        format('billetera B=%s saldo=%s pagos=%s',
               (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_b),
               (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_compart),
               (SELECT count(*) FROM public.p_prestamos_pagos WHERE prestamo_id = v_compart)));

    -- W1: B deletes the payment B registered.
    BEGIN
        PERFORM public.fn_prestamo_eliminar_pago(v_pago_b);
        INSERT INTO t_resultado VALUES (14, 'W1 eliminar pago: B elimina su propio pago y todo vuelve al punto de partida',
            ((SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_b) = v_wb0
             AND (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_compart) = 2000
             AND (SELECT count(*) FROM public.p_prestamos_pagos WHERE pago_id = v_pago_b) = 0),
            format('billetera B=%s saldo=%s',
                   (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_b),
                   (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_compart)));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (14, 'W1 eliminar pago: B elimina su propio pago y todo vuelve al punto de partida', false, 'mensaje=' || v_msg);
    END;

    -- W2: the payment operations on A's private loan are out of B's reach too.
    BEGIN
        PERFORM public.fn_prestamo_corregir_pago(
            p_pago_id          => v_pago_a,
            p_billetera_id     => v_wallet_b,
            p_monto_billetera  => 10,
            p_moneda_billetera => 'ARS',
            p_monto_aplicado   => 10);
        INSERT INTO t_resultado VALUES (15, 'W2 corregir pago: B no corrige un pago de la deuda privada de A', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (15, 'W2 corregir pago: B no corrige un pago de la deuda privada de A',
            (v_msg LIKE '%error_payment_not_found%'), 'mensaje=' || v_msg);
    END;

    BEGIN
        PERFORM public.fn_prestamo_eliminar_pago(v_pago_a);
        INSERT INTO t_resultado VALUES (16, 'W2 eliminar pago: B no elimina un pago de la deuda privada de A', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (16, 'W2 eliminar pago: B no elimina un pago de la deuda privada de A',
            (v_msg LIKE '%error_payment_not_found%'
             AND (SELECT count(*) FROM public.p_prestamos_pagos WHERE pago_id = v_pago_a) = 1),
            format('%s pago de A intacto=%s', v_msg,
                   (SELECT count(*) FROM public.p_prestamos_pagos WHERE pago_id = v_pago_a)));
    END;

    -- =======================================================================
    -- W1 — links questionnaire and the legacy debt manager
    -- =======================================================================
    BEGIN
        v_n := public.fn_saneamiento_vinculos_responder(
            jsonb_build_array(jsonb_build_object('prestamo_id', v_compart, 'criterios', jsonb_build_array(1, 3))));
        SELECT p.puntos_vinculo, count(*) INTO v_puntos, v_m
        FROM public.p_prestamos p
        JOIN public.p_prestamos_vinculos v ON v.prestamo_id = p.prestamo_id
        WHERE p.prestamo_id = v_compart AND v.user_id = v_b
        GROUP BY p.puntos_vinculo;
        INSERT INTO t_resultado VALUES (17, 'W1 vinculos: B responde los vinculos de la deuda coposeida y el puntaje queda en la fila de A',
            (v_n = 1 AND v_puntos = 8 AND v_m = 2),
            format('filas=%s puntos=%s respuestas=%s (esperado 1 / 5+3 / 2)', v_n, v_puntos, v_m));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (17, 'W1 vinculos: B responde los vinculos de la deuda coposeida y el puntaje queda en la fila de A',
            false, 'mensaje=' || v_msg);
    END;

    BEGIN
        PERFORM public.fn_saneamiento_vinculos_responder(
            jsonb_build_array(jsonb_build_object('prestamo_id', v_privado, 'criterios', jsonb_build_array(1))));
        INSERT INTO t_resultado VALUES (18, 'W2 vinculos: B no responde los vinculos de la deuda privada de A', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (18, 'W2 vinculos: B no responde los vinculos de la deuda privada de A',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    BEGIN
        PERFORM public.fn_gestionar_deuda(
            p_operacion      => 'editar',
            p_prestamo_id    => v_compart,
            p_nombre_prestamo => 'TEST_ESC_Legacy_por_B');
        INSERT INTO t_resultado VALUES (19, 'W1 gestionar_deuda: B edita la deuda coposeida con la RPC legacy',
            ((SELECT count(*) FROM public.p_prestamos
              WHERE prestamo_id = v_compart AND nombre_prestamo = 'TEST_ESC_Legacy_por_B') = 1),
            'nombre cambiado');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (19, 'W1 gestionar_deuda: B edita la deuda coposeida con la RPC legacy', false, 'mensaje=' || v_msg);
    END;

    BEGIN
        PERFORM public.fn_gestionar_deuda(p_operacion => 'editar', p_prestamo_id => v_privado, p_nombre_prestamo => 'TEST_ESC_Intruso');
        INSERT INTO t_resultado VALUES (20, 'W2 gestionar_deuda: B no edita la deuda privada de A', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (20, 'W2 gestionar_deuda: B no edita la deuda privada de A',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    BEGIN
        PERFORM public.fn_gestionar_deuda(p_operacion => 'archivar', p_prestamo_id => v_privado);
        INSERT INTO t_resultado VALUES (21, 'W2 gestionar_deuda: B no archiva la deuda privada de A', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (21, 'W2 gestionar_deuda: B no archiva la deuda privada de A',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- W2 closing: nothing that was rejected left a trace.
    INSERT INTO t_resultado VALUES (22, 'W2: ninguna llamada rechazada escribio nada (deuda privada de A intacta)',
        ((SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_privado) = 900
         AND (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_privado) = 'activo'
         AND (SELECT entidad_nombre FROM public.p_prestamos WHERE prestamo_id = v_privado) = 'TEST_ESC_PrivadoA'
         AND (SELECT user_id FROM public.p_prestamos WHERE prestamo_id = v_privado) = v_a
         AND (SELECT count(*) FROM public.p_prestamos_pagos WHERE prestamo_id = v_privado) = 1
         AND (SELECT count(*) FROM public.p_prestamos_vinculos WHERE prestamo_id = v_privado) = 0),
        format('saldo=%s estado=%s nombre=%s pagos=%s vinculos=%s',
               (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_privado),
               (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_privado),
               (SELECT entidad_nombre FROM public.p_prestamos WHERE prestamo_id = v_privado),
               (SELECT count(*) FROM public.p_prestamos_pagos WHERE prestamo_id = v_privado),
               (SELECT count(*) FROM public.p_prestamos_vinculos WHERE prestamo_id = v_privado)));

    -- =======================================================================
    -- W6 — a caller with no household (C) and one in another household (D)
    -- still select exactly what the old predicate selected.
    -- =======================================================================
    SELECT count(*) INTO v_total FROM public.p_prestamos;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_c)::text, true);
    SELECT hogar_id INTO v_hogar_c FROM public.p_hogar_participantes WHERE user_id = v_c;

    WITH viejo AS (
        SELECT prestamo_id FROM public.p_prestamos WHERE user_id = v_c
    ), nuevo AS (
        SELECT prestamo_id FROM public.p_prestamos
        WHERE (user_id = v_c OR (v_hogar_c IS NOT NULL AND hogar_id = v_hogar_c))
    ), dif AS (
        (SELECT prestamo_id FROM viejo EXCEPT SELECT prestamo_id FROM nuevo)
        UNION ALL
        (SELECT prestamo_id FROM nuevo EXCEPT SELECT prestamo_id FROM viejo)
    )
    SELECT (SELECT count(*) FROM viejo), (SELECT count(*) FROM nuevo), (SELECT count(*) FROM dif)
      INTO v_viejo, v_nuevo, v_dif;

    INSERT INTO t_resultado VALUES (23, 'W6 equivalencia: para C, sin hogar, el predicado nuevo devuelve exactamente lo que devolvia el viejo',
        (v_hogar_c IS NULL AND v_dif = 0 AND v_viejo = v_nuevo AND v_viejo >= 1 AND v_viejo < v_total),
        format('hogar=%s viejo=%s nuevo=%s diferencia=%s de %s filas en total',
               v_hogar_c, v_viejo, v_nuevo, v_dif, v_total));

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_d)::text, true);
    SELECT hogar_id INTO v_hogar_d FROM public.p_hogar_participantes WHERE user_id = v_d;

    WITH viejo AS (
        SELECT prestamo_id FROM public.p_prestamos WHERE user_id = v_d
    ), nuevo AS (
        SELECT prestamo_id FROM public.p_prestamos
        WHERE (user_id = v_d OR (v_hogar_d IS NOT NULL AND hogar_id = v_hogar_d))
    ), dif AS (
        (SELECT prestamo_id FROM viejo EXCEPT SELECT prestamo_id FROM nuevo)
        UNION ALL
        (SELECT prestamo_id FROM nuevo EXCEPT SELECT prestamo_id FROM viejo)
    )
    SELECT (SELECT count(*) FROM viejo), (SELECT count(*) FROM nuevo), (SELECT count(*) FROM dif)
      INTO v_viejo, v_nuevo, v_dif;

    INSERT INTO t_resultado VALUES (24, 'W6 equivalencia: para D, de otro hogar, el predicado nuevo tampoco alcanza filas ajenas',
        (v_hogar_d IS NOT NULL AND v_hogar_d <> v_hogar_ab AND v_dif = 0
         AND v_viejo = v_nuevo AND v_viejo = 1),
        format('hogar=%s viejo=%s nuevo=%s diferencia=%s', v_hogar_d, v_viejo, v_nuevo, v_dif));

    -- W2 for C and D against the co-owned loan of A and B, which is still alive here.
    BEGIN
        PERFORM public.fn_prestamo_editar(v_compart, p_contraparte => 'TEST_ESC_Intruso');
        INSERT INTO t_resultado VALUES (25, 'W6: C, sin hogar, no edita la deuda coposeida del hogar de A y B', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (25, 'W6: C, sin hogar, no edita la deuda coposeida del hogar de A y B',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    BEGIN
        PERFORM public.fn_prestamo_registrar_pago(
            p_prestamo_id      => v_compart,
            p_billetera_id     => v_wallet_c,
            p_monto_billetera  => 10,
            p_moneda_billetera => 'ARS',
            p_monto_aplicado   => 10);
        INSERT INTO t_resultado VALUES (26, 'W6: C, sin hogar, no paga la deuda coposeida del hogar de A y B', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (26, 'W6: C, sin hogar, no paga la deuda coposeida del hogar de A y B',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_d)::text, true);
    BEGIN
        PERFORM public.fn_prestamo_editar(v_compart, p_contraparte => 'TEST_ESC_Intruso');
        INSERT INTO t_resultado VALUES (27, 'W6: D, de otro hogar, no edita la deuda coposeida del hogar de A y B', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (27, 'W6: D, de otro hogar, no edita la deuda coposeida del hogar de A y B',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- =======================================================================
    -- W6 — C's own cycle is unchanged: the fix must not touch a household-less
    -- caller's own operations.
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_c)::text, true);
    v_wb0 := (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_c);

    BEGIN
        PERFORM public.fn_prestamo_editar(v_propio_c, p_contraparte => 'TEST_ESC_PropioC_editado',
                                          p_tasa_anual => 5, p_tasa_informada => true);
        v_pago_b := public.fn_prestamo_registrar_pago(
            p_prestamo_id      => v_propio_c,
            p_billetera_id     => v_wallet_c,
            p_monto_billetera  => 100,
            p_moneda_billetera => 'ARS',
            p_monto_aplicado   => 100);
        INSERT INTO t_resultado VALUES (28, 'W6 sin hogar: C edita y paga su propia deuda igual que antes',
            ((SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_propio_c) = 600
             AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_c) = v_wb0 - 100),
            format('saldo=%s billetera=%s',
                   (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_propio_c),
                   (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_c)));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (28, 'W6 sin hogar: C edita y paga su propia deuda igual que antes', false, 'mensaje=' || v_msg);
    END;

    BEGIN
        PERFORM public.fn_prestamo_corregir_pago(
            p_pago_id          => v_pago_b,
            p_billetera_id     => v_wallet_c,
            p_monto_billetera  => 200,
            p_moneda_billetera => 'ARS',
            p_monto_aplicado   => 200);
        PERFORM public.fn_prestamo_eliminar_pago(v_pago_b);
        INSERT INTO t_resultado VALUES (29, 'W6 sin hogar: C corrige y borra su propio pago igual que antes',
            ((SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_propio_c) = 700
             AND (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_c) = v_wb0),
            format('saldo=%s billetera=%s',
                   (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_propio_c),
                   (SELECT saldo_actual FROM public.p_billeteras WHERE billetera_id = v_wallet_c)));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (29, 'W6 sin hogar: C corrige y borra su propio pago igual que antes', false, 'mensaje=' || v_msg);
    END;

    BEGIN
        v_n := public.fn_saneamiento_vinculos_responder(
            jsonb_build_array(jsonb_build_object('prestamo_id', v_propio_c, 'criterios', jsonb_build_array(1))));
        v_pago_b := public.fn_prestamo_registrar_pago(
            p_prestamo_id      => v_propio_c,
            p_billetera_id     => v_wallet_c,
            p_monto_billetera  => 700,
            p_moneda_billetera => 'ARS',
            p_monto_aplicado   => 700);
        PERFORM public.fn_prestamo_eliminar_historial(v_propio_c, true);
        INSERT INTO t_resultado VALUES (30, 'W6 sin hogar: C responde vinculos, salda y borra del historial su propia deuda',
            (v_n = 1
             AND (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_propio_c) = 'eliminado'
             AND (SELECT count(*) FROM public.p_caja WHERE p_caja_id =
                    (SELECT p_caja_id FROM public.p_prestamos_pagos WHERE prestamo_id = v_propio_c)) = 1),
            format('vinculos=%s estado=%s caja conservada=%s', v_n,
                   (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_propio_c),
                   (SELECT count(*) FROM public.p_caja WHERE p_caja_id =
                      (SELECT p_caja_id FROM public.p_prestamos_pagos WHERE prestamo_id = v_propio_c))));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (30, 'W6 sin hogar: C responde vinculos, salda y borra del historial su propia deuda', false, 'mensaje=' || v_msg);
    END;

    -- =======================================================================
    -- W5 — deletion of the shared debt is bilateral
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);

    BEGIN
        v_pago_b := public.fn_prestamo_registrar_pago(
            p_prestamo_id      => v_compart,
            p_billetera_id     => v_wallet_b,
            p_monto_billetera  => 2000,
            p_moneda_billetera => 'ARS',
            p_monto_aplicado   => 2000);
        INSERT INTO t_resultado VALUES (31, 'W5: B salda la deuda coposeida desde su propia billetera',
            ((SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_compart) = 0
             AND (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_compart) = 'pagado'),
            format('pago=%s saldo=%s estado=%s', v_pago_b,
                   (SELECT saldo_actual FROM public.p_prestamos WHERE prestamo_id = v_compart),
                   (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_compart)));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (31, 'W5: B salda la deuda coposeida desde su propia billetera', false, 'mensaje=' || v_msg);
    END;

    SELECT count(*) INTO v_pagos0 FROM public.p_prestamos_pagos WHERE prestamo_id = v_compart;
    SELECT count(*) INTO v_cajas0 FROM public.p_caja;

    BEGIN
        PERFORM public.fn_prestamo_eliminar_historial(v_compart, true);
        INSERT INTO t_resultado VALUES (32, 'W5: B quita del historial una deuda que creo A',
            ((SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_compart) = 'eliminado'
             AND (SELECT eliminado_at FROM public.p_prestamos WHERE prestamo_id = v_compart) IS NOT NULL
             AND (SELECT count(*) FROM public.p_prestamos_pagos WHERE prestamo_id = v_compart) = v_pagos0
             AND (SELECT count(*) FROM public.p_caja) = v_cajas0),
            format('estado=%s pagos=%s/%s cajas=%s/%s',
                   (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_compart),
                   (SELECT count(*) FROM public.p_prestamos_pagos WHERE prestamo_id = v_compart), v_pagos0,
                   (SELECT count(*) FROM public.p_caja), v_cajas0));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (32, 'W5: B quita del historial una deuda que creo A', false, 'mensaje=' || v_msg);
    END;

    -- Bilateral: A no longer sees it either, and that is the point, not a defect.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);
    SELECT count(*) INTO v_n FROM public.fn_prestamos_listar('debo', true) l WHERE l.prestamo_id = v_compart;
    SELECT count(*) INTO v_m FROM public.fn_prestamos_listar('debo', true) l WHERE l.prestamo_id = v_privado;
    INSERT INTO t_resultado VALUES (33, 'W5 bilateral: la deuda borrada desaparece para los dos y la privada de A sigue a la vista',
        (v_n = 0 AND v_m = 1), format('compartida visible=%s privada visible=%s', v_n, v_m));

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);
    BEGIN
        PERFORM public.fn_prestamo_eliminar_historial(v_privado, true);
        INSERT INTO t_resultado VALUES (34, 'W2 eliminar historial: B no quita del historial la deuda privada de A', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (34, 'W2 eliminar historial: B no quita del historial la deuda privada de A',
            (v_msg LIKE '%error_debt_not_found%'
             AND (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_privado) = 'activo'),
            format('%s estado privada=%s', v_msg,
                   (SELECT estado FROM public.p_prestamos WHERE prestamo_id = v_privado)));
    END;

    -- =======================================================================
    -- S — the audit is complete and the deliberate non-changes are asserted
    -- =======================================================================
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_prestamo_editar', 'fn_prestamo_registrar_pago',
                        'fn_prestamo_eliminar_historial', 'fn_gestionar_deuda',
                        'fn_saneamiento_vinculos_responder')
      AND position('(user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))' IN p.prosrc) > 0
      AND position('FROM public.p_hogar_participantes WHERE user_id = v_user_id' IN p.prosrc) > 0;
    INSERT INTO t_resultado VALUES (35, 'S: las cinco funciones de escritura usan el predicado de lectura y derivan el hogar igual',
        (v_n = 5), format('definiciones ajustadas=%s de 5', v_n));

    -- The two payment operations stay payer-scoped, by decision, and carry no hogar_id:
    -- the cash leg belongs to whoever put the money in and the wallet is validated
    -- against the caller.
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_prestamo_corregir_pago', 'fn_prestamo_eliminar_pago');
    SELECT count(*) INTO v_m
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_prestamo_corregir_pago', 'fn_prestamo_eliminar_pago')
      AND position('WHERE pago_id = p_pago_id AND user_id = v_user_id' IN p.prosrc) > 0
      AND position('hogar_id' IN p.prosrc) = 0;
    INSERT INTO t_resultado VALUES (36, 'S: corregir y eliminar pago siguen acotados al pagador (decision registrada, sin cambios)',
        (v_n = 2 AND v_m = 2), format('funciones=%s acotadas=%s', v_n, v_m));

    -- Nothing in the balance path derives from user_id, which is why a payment by B
    -- recalculates A's loan exactly once.
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_prestamos_aplicar_saldo', 'fn_prestamos_recalcular_saldo')
      AND position('user_id' IN p.prosrc) = 0;
    INSERT INTO t_resultado VALUES (37, 'S: el recálculo del saldo (funcion y trigger) no deriva nada de user_id',
        (v_n = 2), format('funciones sin user_id=%s de 2', v_n));
END $$;

SELECT orden, assertion,
       CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
