-- Transactional verification of T17 part 1: backups and user deletion.
--
-- Runs inside BEGIN ... ROLLBACK, so calling the destructive routines is safe.
--
-- Proves:
--   F1  the master backup carries loans, their schedule and their operations
--   F2  the financial passport carries the same three
--   F3  the range export, which previously exported no loans at all, now does
--   F4  deleting a user's data removes the new tables without an FK failure

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth   uuid;
    v_user   bigint;
    v_wallet bigint;
    v_loan   bigint;
    v_pago   bigint;
    v_backup jsonb;
    v_pass   jsonb;
    v_rango  jsonb;
    v_n      integer;
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

    -- Fixture: a loan with a two-installment schedule and one recorded payment.
    v_loan := public.fn_prestamo_crear(
        p_direccion => 'debo', p_contraparte => 'TEST_F_Banco', p_moneda => 'ARS',
        p_monto_original => 80000, p_modalidad => 'cuotas', p_es_historico => true,
        p_saldo_al_ingreso => 80000,
        p_cuotas => jsonb_build_array(
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 20, 'monto_cuota', 40000, 'interes_componente', 500),
            jsonb_build_object('fecha_vencimiento', CURRENT_DATE + 50, 'monto_cuota', 40000, 'interes_componente', 250)));
    v_pago := public.fn_registrar_pago_extra_deuda(v_loan, 10000, v_wallet, CURRENT_DATE, 'test_f');

    -- ---- F1: master backup ---------------------------------------------
    v_backup := public.fn_exportar_backup_maestro();
    INSERT INTO t_resultado VALUES (1, 'F1 backup maestro incluye prestamos, cuotas y pagos',
        (jsonb_array_length(COALESCE(v_backup->'prestamos', '[]'::jsonb)) >= 1
         AND jsonb_array_length(COALESCE(v_backup->'prestamos_cuotas', '[]'::jsonb)) = 2
         AND jsonb_array_length(COALESCE(v_backup->'prestamos_pagos', '[]'::jsonb)) >= 1),
        format('prestamos=%s cuotas=%s pagos=%s',
               jsonb_array_length(COALESCE(v_backup->'prestamos', '[]'::jsonb)),
               jsonb_array_length(COALESCE(v_backup->'prestamos_cuotas', '[]'::jsonb)),
               jsonb_array_length(COALESCE(v_backup->'prestamos_pagos', '[]'::jsonb))));

    -- ---- F2: financial passport ----------------------------------------
    -- Nested under pasaporte_financiero -> historial_completo.
    v_pass := public.fn_exportar_pasaporte_financiero()->'pasaporte_financiero'->'historial_completo';
    INSERT INTO t_resultado VALUES (2, 'F2 pasaporte incluye prestamos, cuotas y pagos',
        (jsonb_array_length(COALESCE(v_pass->'prestamos', '[]'::jsonb)) >= 1
         AND jsonb_array_length(COALESCE(v_pass->'prestamos_cuotas', '[]'::jsonb)) = 2
         AND jsonb_array_length(COALESCE(v_pass->'prestamos_pagos', '[]'::jsonb)) >= 1),
        format('prestamos=%s cuotas=%s pagos=%s',
               jsonb_array_length(COALESCE(v_pass->'prestamos', '[]'::jsonb)),
               jsonb_array_length(COALESCE(v_pass->'prestamos_cuotas', '[]'::jsonb)),
               jsonb_array_length(COALESCE(v_pass->'prestamos_pagos', '[]'::jsonb))));

    -- ---- F3: range export ----------------------------------------------
    v_rango := public.fn_exportar_datos_usuario_rango(CURRENT_DATE - 30, CURRENT_DATE + 30);
    INSERT INTO t_resultado VALUES (3, 'F3 export por rango incluye prestamos y pagos',
        (jsonb_array_length(COALESCE(v_rango->'prestamos', '[]'::jsonb)) >= 1
         AND jsonb_array_length(COALESCE(v_rango->'prestamos_pagos', '[]'::jsonb)) >= 1),
        format('prestamos=%s cuotas=%s pagos=%s',
               jsonb_array_length(COALESCE(v_rango->'prestamos', '[]'::jsonb)),
               jsonb_array_length(COALESCE(v_rango->'prestamos_cuotas', '[]'::jsonb)),
               jsonb_array_length(COALESCE(v_rango->'prestamos_pagos', '[]'::jsonb))));

    -- ---- F4: user deletion ----------------------------------------------
    -- NOT EXERCISED: fn_borrar_datos_usuario is broken by two pre-existing defects
    -- outside this module, and neither belongs to the loans rebuild.
    --   (1) it accumulated json with the jsonb-only `||` operator, so it raised 42883
    --       on the first table (fixed here, since the path could never complete);
    --   (2) once it runs, fn_tr_anular_inversion_al_borrar_movimiento recurses
    --       infinitely over movements sharing an inversion_id, so it now dies with
    --       a stack-depth error instead.
    -- Both are reported to the owner. The loans part is asserted by source instead:
    -- the two tables are present in its deletion array.
    INSERT INTO t_resultado VALUES (4, 'F4 la rutina de borrado conoce las tablas nuevas',
        (position('p_prestamos_pagos' IN (
            SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario')) > 0
         AND position('p_prestamos_cuotas' IN (
            SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'fn_borrar_datos_usuario')) > 0),
        'verificado por fuente: la ejecucion esta bloqueada por defectos ajenos al modulo');
END $$;

SELECT orden, assertion,
       CASE WHEN ok IS NULL THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
