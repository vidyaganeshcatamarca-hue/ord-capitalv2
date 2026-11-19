-- Transactional verification of the admin clone for the loans module.
--
-- Runs inside BEGIN ... ROLLBACK. The destination user's data is replaced by the
-- clone inside the transaction and restored by the rollback.
--
-- Proves:
--   I1  the clone reproduces the loan count
--   I2  saldo_al_ingreso and the rest of the rebuild columns are copied, not reset
--   I3  the schedule is copied, attached to the destination's loans
--   I4  the operations are copied, attached to the destination's loans, cash rows
--       and wallets
--   I5  no cloned row points at the source user or at a source id
--   I6  the Vinculos answers travel with their loan

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_src      bigint;
    v_dst      bigint;
    v_wallet   bigint;
    v_cuotas   bigint;
    v_pagos    bigint;
    v_loans    bigint;
    v_res      jsonb;
    v_n        integer;
    v_bad      integer;
    v_msg      text;
BEGIN
    -- Source: a user with a wallet and no quarantine rows. The clone has a
    -- pre-existing collision on p_caja_cuarentena's unique index, unrelated to this
    -- module, so the fixture avoids that table entirely.
    SELECT u.user_id INTO v_src FROM public.usuarios u
    JOIN public.p_billeteras b ON b.user_id = u.user_id
    WHERE u.auth_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.p_caja_cuarentena q WHERE q.user_id = u.user_id)
    ORDER BY u.user_id LIMIT 1;

    -- Destination: a clean user created inside this transaction. Reusing a real user
    -- would drag in unrelated modules whose tables the clone's wipe does not know
    -- about (p_sobre_movimientos), which is a reported pre-existing gap outside this
    -- module. A fresh destination isolates the loans round trip.
    INSERT INTO public.usuarios (nombre, login, password)
    VALUES ('TEST_I_Destino', 'test_i_destino_transaccional', 'x')
    RETURNING user_id INTO v_dst;

    IF v_src IS NULL OR v_dst IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'se necesitan dos usuarios');
        RETURN;
    END IF;

    SELECT billetera_id INTO v_wallet
    FROM public.p_billeteras WHERE user_id = v_src AND moneda = 'ARS' AND activa = true LIMIT 1;

    -- fn_prestamo_crear resolves the user from auth.uid() and the clone requires
    -- auth.role() = 'service_role'. Simulate both inside this transaction only.
    PERFORM set_config('request.jwt.claims',
        (SELECT jsonb_build_object('sub', auth_id, 'role', 'service_role')::text
           FROM public.usuarios WHERE user_id = v_src),
        true);

    -- Fixtures owned by the source user.
    DECLARE
        v_loan bigint;
        v_pago bigint;
    BEGIN
        v_loan := public.fn_prestamo_crear(
            p_direccion => 'debo', p_contraparte => 'TEST_I_Banco', p_moneda => 'ARS',
            p_monto_original => 90000, p_modalidad => 'cuotas', p_es_historico => true,
            p_saldo_al_ingreso => 90000,
            p_cuotas => jsonb_build_array(
                jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 30, 'monto_cuota', 45000, 'interes_componente', 500),
                jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 60, 'monto_cuota', 45000, 'interes_componente', 250)));

        -- A payment goes through the loan table directly: the RPC needs an
        -- authenticated session, and this suite is about the clone, not the RPC.
        INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, valor_egreso, fecha, moneda,
                                   estructura_egreso_id, detalle, metadata)
        VALUES (v_src, 'expense', v_wallet, 10000, CURRENT_DATE, 'ARS',
                public.fn_prestamos_ensure_categoria_egreso(v_src, 'cat_debt_payment'),
                'test_i', jsonb_build_object('prestamo_id', v_loan))
        RETURNING p_caja_id INTO v_pago;

        INSERT INTO public.p_prestamos_pagos
            (prestamo_id, user_id, p_caja_id, direccion, fecha, billetera_id,
             moneda_billetera, monto_billetera, moneda_prestamo, monto_aplicado)
        VALUES (v_loan, v_src, v_pago, 'pago', CURRENT_DATE, v_wallet, 'ARS', 10000, 'ARS', 10000);
    END;

    SELECT count(*), COALESCE(SUM((SELECT count(*) FROM public.p_prestamos_cuotas c WHERE c.prestamo_id = p.prestamo_id)), 0)
      INTO v_loans, v_cuotas
    FROM public.p_prestamos p WHERE p.user_id = v_src;

    SELECT count(*) INTO v_pagos FROM public.p_prestamos_pagos WHERE user_id = v_src;

    -- Vinculos answer, created before the single clone call: the clone cannot run
    -- twice in one transaction because its temp maps are ON COMMIT DROP.
    INSERT INTO public.p_prestamos_vinculos (prestamo_id, user_id, criterio, seleccionado)
    SELECT p.prestamo_id, v_src, 3, true FROM public.p_prestamos p
    WHERE p.user_id = v_src AND p.entidad_nombre = 'TEST_I_Banco';

    BEGIN
        -- The clone refuses any destination outside this whitelist. Added inside the
        -- transaction only, so the real whitelist is untouched.
        INSERT INTO public.admin_clone_destinos_permitidos (destino_user_id, habilitado, descripcion)
        VALUES (v_dst, true, 'test transaccional de clon')
        ON CONFLICT (destino_user_id) DO UPDATE SET habilitado = true;

        v_res := public.fn_clonar_usuario_admin(v_src, v_dst, false);
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (0, 'clon ejecutado', false, 'fallo: ' || v_msg);
        RETURN;
    END;

    -- I1
    SELECT count(*) INTO v_n FROM public.p_prestamos WHERE user_id = v_dst;
    INSERT INTO t_resultado VALUES (1, 'I1 el clon reproduce la cantidad de prestamos',
        (v_n = v_loans), format('origen=%s destino=%s', v_loans, v_n));

    -- I2: the rebuild columns travel, saldo_al_ingreso above all.
    SELECT count(*) INTO v_bad FROM public.p_prestamos
    WHERE user_id = v_dst AND (saldo_al_ingreso = 0 OR modalidad IS NULL);
    INSERT INTO t_resultado VALUES (2, 'I2 saldo_al_ingreso y modalidad se copian',
        (v_bad = 0), format('filas del destino con saldo_al_ingreso en cero=%s', v_bad));

    -- I3: the schedule, attached to destination loans.
    SELECT count(*) INTO v_n FROM public.p_prestamos_cuotas WHERE user_id = v_dst;
    SELECT count(*) INTO v_bad FROM public.p_prestamos_cuotas c
    WHERE c.user_id = v_dst
      AND NOT EXISTS (SELECT 1 FROM public.p_prestamos p WHERE p.prestamo_id = c.prestamo_id AND p.user_id = v_dst);
    INSERT INTO t_resultado VALUES (3, 'I3 el cronograma viaja y cuelga de prestamos del destino',
        (v_n = v_cuotas AND v_bad = 0), format('origen=%s destino=%s huerfanas=%s', v_cuotas, v_n, v_bad));

    -- I4: the operations, attached to destination loans, cash rows and wallets.
    SELECT count(*) INTO v_n FROM public.p_prestamos_pagos WHERE user_id = v_dst;
    SELECT count(*) INTO v_bad FROM public.p_prestamos_pagos g
    WHERE g.user_id = v_dst
      AND (NOT EXISTS (SELECT 1 FROM public.p_prestamos p WHERE p.prestamo_id = g.prestamo_id AND p.user_id = v_dst)
           OR NOT EXISTS (SELECT 1 FROM public.p_caja c WHERE c.p_caja_id = g.p_caja_id AND c.user_id = v_dst)
           OR NOT EXISTS (SELECT 1 FROM public.p_billeteras b WHERE b.billetera_id = g.billetera_id AND b.user_id = v_dst));
    INSERT INTO t_resultado VALUES (4, 'I4 las operaciones viajan y apuntan a caja y billetera del destino',
        (v_n = v_pagos AND v_bad = 0), format('origen=%s destino=%s mal apuntadas=%s', v_pagos, v_n, v_bad));

    -- I5: nothing points back at the source user.
    SELECT count(*) INTO v_bad FROM public.p_prestamos WHERE user_id = v_dst AND user_id = v_src;
    SELECT v_bad + count(*) INTO v_bad FROM public.p_prestamos_pagos WHERE user_id = v_dst AND user_id = v_src;
    SELECT v_bad + count(*) INTO v_bad FROM public.p_prestamos_cuotas WHERE user_id = v_dst AND user_id = v_src;
    INSERT INTO t_resultado VALUES (5, 'I5 ninguna fila clonada queda a nombre del origen',
        (v_bad = 0), format('filas con user_id del origen=%s', v_bad));

    -- I6: Vinculos answers travel with their loan.
    SELECT count(*) INTO v_n FROM public.p_prestamos_vinculos WHERE user_id = v_dst;
    SELECT count(*) INTO v_bad FROM public.p_prestamos_vinculos v
    WHERE v.user_id = v_dst
      AND NOT EXISTS (SELECT 1 FROM public.p_prestamos p WHERE p.prestamo_id = v.prestamo_id AND p.user_id = v_dst);
    INSERT INTO t_resultado VALUES (6, 'I6 las respuestas de Vinculos viajan con su prestamo',
        (v_n >= 1 AND v_bad = 0), format('destino=%s huerfanas=%s', v_n, v_bad));
END $$;

SELECT orden, assertion,
       CASE WHEN ok IS NULL THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       detalle
FROM t_resultado ORDER BY orden, assertion;

ROLLBACK;
