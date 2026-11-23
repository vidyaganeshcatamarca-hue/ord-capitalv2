-- Transactional verification of T29 / S30 read side: co-ownership is honoured by the
-- read layer, and privacy survives it.
--
-- Runs inside BEGIN ... ROLLBACK with throwaway users created here. No real user's
-- rows are read or locked.
--
-- The rule under test, exactly as fn_obtener_arbol_categorias already does it:
--   a row is visible when it belongs to the caller, or when it is co-owned by the
--   household the caller is a member of
--       (row.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND row.hogar_id = v_hogar_id))
--
-- Proves:
--   L1  B, the other member of the household, sees the co-owned loan through
--       fn_prestamos_listar, fn_prestamo_detalle, fn_prestamos_resumen and
--       fn_prestamos_calendario
--   L2  B does not see A's private loan through any of those four
--   L3  C, who belongs to no household, sees exactly what the old predicate showed:
--       its own rows and nothing else
--   G   the membership guard: writing a household the caller does not belong to raises
--       error_hogar_no_pertenece on create and on edit, and the same call with a
--       household the caller does belong to succeeds

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth_a    uuid := gen_random_uuid();
    v_auth_b    uuid := gen_random_uuid();
    v_auth_c    uuid := gen_random_uuid();
    v_auth_d    uuid := gen_random_uuid();
    v_auth_e    uuid := gen_random_uuid();
    v_a         bigint;
    v_b         bigint;
    v_c         bigint;
    v_d         bigint;
    v_e         bigint;
    v_hogar       bigint;
    v_hogar_ajeno bigint;
    v_hogar_leido bigint;
    v_privado   bigint;
    v_compart   bigint;
    v_propio_c  bigint;
    v_n         integer;
    v_suma      numeric;
    v_saldo     numeric;
    v_msg       text;
    v_id        bigint;
BEGIN
    -- ---- fixture: A and B share a household; C has none; D and E share another --
    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_a, 'TEST_COPRO_A', 'test_copro_a_' || left(replace(v_auth_a::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_a;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_b, 'TEST_COPRO_B', 'test_copro_b_' || left(replace(v_auth_b::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_b;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_c, 'TEST_COPRO_C', 'test_copro_c_' || left(replace(v_auth_c::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_c;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_d, 'TEST_COPRO_D', 'test_copro_d_' || left(replace(v_auth_d::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_d;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_e, 'TEST_COPRO_E', 'test_copro_e_' || left(replace(v_auth_e::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_e;

    IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL OR v_d IS NULL OR v_e IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'no se pudieron crear los usuarios descartables');
        RETURN;
    END IF;

    INSERT INTO public.p_hogares (nombre_hogar, porcentaje_usuario_creador, porcentaje_usuario_invitado)
    VALUES ('TEST_COPRO_Hogar', 50, 50)
    RETURNING hogar_id INTO v_hogar;

    INSERT INTO public.p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar, v_a, 'creador'), (v_hogar, v_b, 'invitado');

    -- A household A belongs to nothing in: the guard must reject it.
    INSERT INTO public.p_hogares (nombre_hogar, porcentaje_usuario_creador, porcentaje_usuario_invitado)
    VALUES ('TEST_COPRO_HogarAjeno', 50, 50)
    RETURNING hogar_id INTO v_hogar_ajeno;

    INSERT INTO public.p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar_ajeno, v_d, 'creador'), (v_hogar_ajeno, v_e, 'invitado');

    -- ---- A registers two loans: one private, one co-owned by the household -----
    -- Both carry a single agreed due date so the calendar emits one event each; the
    -- currencies differ so the summary cannot add them up by accident.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    v_privado := public.fn_prestamo_crear(
        p_direccion           => 'debo',
        p_contraparte         => 'TEST_COPRO_Privado',
        p_moneda              => 'USD',
        p_monto_original      => 500,
        p_modalidad           => 'vencimiento_unico',
        p_proximo_vencimiento => CURRENT_DATE + 10,
        p_es_historico        => true);

    v_compart := public.fn_prestamo_crear(
        p_direccion           => 'debo',
        p_contraparte         => 'TEST_COPRO_Compartido',
        p_moneda              => 'ARS',
        p_monto_original      => 2000,
        p_modalidad           => 'vencimiento_unico',
        p_proximo_vencimiento => CURRENT_DATE + 6,
        p_es_historico        => true,
        p_hogar_id            => v_hogar);

    INSERT INTO t_resultado VALUES (1, 'setup A: un prestamo privado y uno coposeido',
        (v_privado IS NOT NULL AND v_compart IS NOT NULL),
        format('privado=%s compartido=%s', v_privado, v_compart));

    -- ---- C registers its own loan; C belongs to no household -------------------
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_c)::text, true);

    v_propio_c := public.fn_prestamo_crear(
        p_direccion           => 'debo',
        p_contraparte         => 'TEST_COPRO_PropioC',
        p_moneda              => 'ARS',
        p_monto_original      => 700,
        p_modalidad           => 'vencimiento_unico',
        p_proximo_vencimiento => CURRENT_DATE + 8,
        p_es_historico        => true);

    INSERT INTO t_resultado VALUES (2, 'setup C: usuario sin hogar con un prestamo propio',
        (v_propio_c IS NOT NULL), format('prestamo_c=%s', v_propio_c));

    -- =======================================================================
    -- L1 / L2 — B, the other member of the household
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);

    -- fn_prestamos_listar
    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar('debo', true) l WHERE l.prestamo_id = v_compart;
    INSERT INTO t_resultado VALUES (3, 'L1 listar: B ve la deuda coposeida',
        (v_n = 1), format('filas=%s', v_n));

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar('debo', true) l WHERE l.prestamo_id = v_privado;
    INSERT INTO t_resultado VALUES (4, 'L2 listar: B no ve la deuda privada de A',
        (v_n = 0), format('filas=%s', v_n));

    SELECT count(*) INTO v_n FROM public.fn_prestamos_listar('debo', true) l;
    INSERT INTO t_resultado VALUES (5, 'L1 listar: el listado de B es exactamente la coposeida',
        (v_n = 1), format('filas totales=%s', v_n));

    -- fn_prestamo_detalle
    BEGIN
        SELECT (public.fn_prestamo_detalle(v_compart)->>'saldo_pendiente')::numeric INTO v_saldo;
        INSERT INTO t_resultado VALUES (6, 'L1 detalle: B abre la deuda coposeida',
            (v_saldo = 2000), format('saldo_pendiente=%s', v_saldo));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (6, 'L1 detalle: B abre la deuda coposeida',
            false, 'mensaje=' || v_msg);
    END;

    BEGIN
        PERFORM public.fn_prestamo_detalle(v_privado);
        INSERT INTO t_resultado VALUES (7, 'L2 detalle: B no abre la deuda privada de A',
            false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (7, 'L2 detalle: B no abre la deuda privada de A',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- fn_prestamos_resumen: one row, and only the co-owned amount
    SELECT count(*), COALESCE(SUM(r.pendiente), 0) INTO v_n, v_suma
    FROM public.fn_prestamos_resumen() r;
    INSERT INTO t_resultado VALUES (8, 'L2 resumen: B no suma en su resumen la deuda privada de A',
        (v_n = 1 AND v_suma = 2000),
        format('filas=%s pendiente=%s (esperado 1 fila y 2000, la privada es USD 500)', v_n, v_suma));

    -- fn_prestamos_calendario
    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_calendario(60) c WHERE c.prestamo_id = v_compart;
    INSERT INTO t_resultado VALUES (9, 'L1 calendario: B ve el vencimiento de la deuda coposeida',
        (v_n = 1), format('eventos=%s', v_n));

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_calendario(60) c WHERE c.prestamo_id = v_privado;
    INSERT INTO t_resultado VALUES (10, 'L2 calendario: B no ve el vencimiento de la deuda privada de A',
        (v_n = 0), format('eventos=%s', v_n));

    SELECT count(*) INTO v_n FROM public.fn_prestamos_calendario(60) c;
    INSERT INTO t_resultado VALUES (11, 'L2 calendario: el calendario de B es exactamente su evento',
        (v_n = 1), format('eventos totales=%s', v_n));

    -- =======================================================================
    -- L3 — C, who belongs to no household: identical to the old predicate
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_c)::text, true);

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar('debo', true) l WHERE l.prestamo_id <> v_propio_c;
    INSERT INTO t_resultado VALUES (12, 'L3 listar: C sin hogar solo ve lo propio',
        (v_n = 0), format('filas ajenas=%s', v_n));

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar('debo', true) l WHERE l.prestamo_id = v_propio_c;
    INSERT INTO t_resultado VALUES (13, 'L3 listar: C conserva su propia fila',
        (v_n = 1), format('filas propias=%s', v_n));

    SELECT count(*), COALESCE(SUM(r.pendiente), 0) INTO v_n, v_suma
    FROM public.fn_prestamos_resumen() r;
    INSERT INTO t_resultado VALUES (14, 'L3 resumen: C conserva exactamente su resumen',
        (v_n = 1 AND v_suma = 700), format('filas=%s pendiente=%s', v_n, v_suma));

    SELECT count(*), COALESCE(SUM(c.monto), 0) INTO v_n, v_suma
    FROM public.fn_prestamos_calendario(60) c;
    INSERT INTO t_resultado VALUES (15, 'L3 calendario: C conserva exactamente su evento',
        (v_n = 1 AND v_suma = 700), format('eventos=%s monto=%s', v_n, v_suma));

    BEGIN
        PERFORM public.fn_prestamo_detalle(v_compart);
        INSERT INTO t_resultado VALUES (16, 'L3 detalle: C sin hogar no abre la deuda coposeida por otro hogar',
            false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (16, 'L3 detalle: C sin hogar no abre la deuda coposeida por otro hogar',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- =======================================================================
    -- G — the membership guard on the write side
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    -- G1 create: a household A does not belong to
    BEGIN
        PERFORM public.fn_prestamo_crear(
            p_direccion      => 'debo',
            p_contraparte    => 'TEST_COPRO_Intruso',
            p_moneda         => 'ARS',
            p_monto_original => 100,
            p_modalidad      => 'libre',
            p_es_historico   => true,
            p_hogar_id       => v_hogar_ajeno);
        INSERT INTO t_resultado VALUES (17, 'G1 crear: un hogar ajeno levanta error_hogar_no_pertenece',
            false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (17, 'G1 crear: un hogar ajeno levanta error_hogar_no_pertenece',
            (v_msg LIKE '%error_hogar_no_pertenece%'), 'mensaje=' || v_msg);
    END;

    SELECT count(*) INTO v_n FROM public.p_prestamos
    WHERE user_id = v_a AND entidad_nombre = 'TEST_COPRO_Intruso';
    INSERT INTO t_resultado VALUES (18, 'G1 crear: la fila rechazada no se escribio',
        (v_n = 0), format('filas=%s', v_n));

    -- G2 edit: the same foreign household, on a loan that is currently private
    BEGIN
        PERFORM public.fn_prestamo_editar(v_privado, p_hogar_id => v_hogar_ajeno);
        INSERT INTO t_resultado VALUES (19, 'G2 editar: un hogar ajeno levanta error_hogar_no_pertenece',
            false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (19, 'G2 editar: un hogar ajeno levanta error_hogar_no_pertenece',
            (v_msg LIKE '%error_hogar_no_pertenece%'), 'mensaje=' || v_msg);
    END;

    SELECT count(*) INTO v_n FROM public.p_prestamos
    WHERE prestamo_id = v_privado AND hogar_id IS NULL;
    INSERT INTO t_resultado VALUES (20, 'G2 editar: el prestamo rechazado sigue privado',
        (v_n = 1), format('filas privadas=%s', v_n));

    -- G3 edit: a call that does not touch the household writes the stored value back
    -- and must not be rejected, even though the loan is co-owned.
    BEGIN
        PERFORM public.fn_prestamo_editar(v_compart, p_nombre => 'TEST_COPRO_Compartido_editado');
        SELECT count(*) INTO v_n FROM public.p_prestamos
        WHERE prestamo_id = v_compart AND hogar_id = v_hogar;
        INSERT INTO t_resultado VALUES (21, 'G3 editar sin tocar el hogar: no exige guardia y conserva el hogar',
            (v_n = 1), format('filas con hogar=%s', v_n));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (21, 'G3 editar sin tocar el hogar: no exige guardia y conserva el hogar',
            false, 'mensaje=' || v_msg);
    END;

    -- G4 edit: the household A does belong to is accepted.
    BEGIN
        PERFORM public.fn_prestamo_editar(v_privado, p_hogar_id => v_hogar);
        SELECT hogar_id INTO v_hogar_leido FROM public.p_prestamos WHERE prestamo_id = v_privado;
        INSERT INTO t_resultado VALUES (22, 'G4 editar con el hogar propio: se acepta y se escribe',
            (v_hogar_leido IS NOT DISTINCT FROM v_hogar),
            format('hogar_id=%s (esperado %s)', v_hogar_leido, v_hogar));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (22, 'G4 editar con el hogar propio: se acepta y se escribe',
            false, 'mensaje=' || v_msg);
    END;

    -- G5 edit: clearing writes null, so the guard judges null and does not fire.
    BEGIN
        PERFORM public.fn_prestamo_editar(v_privado, p_limpiar_hogar => true);
        SELECT count(*) INTO v_n FROM public.p_prestamos
        WHERE prestamo_id = v_privado AND hogar_id IS NULL;
        INSERT INTO t_resultado VALUES (23, 'G5 editar limpiando el hogar: la guardia no se dispara y la fila vuelve a privada',
            (v_n = 1), format('filas privadas=%s', v_n));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (23, 'G5 editar limpiando el hogar: la guardia no se dispara y la fila vuelve a privada',
            false, 'mensaje=' || v_msg);
    END;

    -- G6 create: the household A does belong to is accepted (A2 of the other suite
    -- already covers this, restated here so the guard is proven from both sides).
    BEGIN
        v_id := public.fn_prestamo_crear(
            p_direccion      => 'debo',
            p_contraparte    => 'TEST_COPRO_Propio',
            p_moneda         => 'ARS',
            p_monto_original => 300,
            p_modalidad      => 'libre',
            p_es_historico   => true,
            p_hogar_id       => v_hogar);
        SELECT hogar_id INTO v_hogar_leido FROM public.p_prestamos WHERE prestamo_id = v_id;
        INSERT INTO t_resultado VALUES (24, 'G6 crear con el hogar propio: se acepta',
            (v_hogar_leido IS NOT DISTINCT FROM v_hogar),
            format('prestamo=%s hogar_id=%s', v_id, v_hogar_leido));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (24, 'G6 crear con el hogar propio: se acepta',
            false, 'mensaje=' || v_msg);
    END;

    -- =======================================================================
    -- L4 — the other audited read functions, called by C, who belongs to no
    -- household. v_hogar_id is NULL there, so the second branch of every predicate
    -- is never true and the result must be exactly the caller's own rows, i.e. what
    -- the old `user_id = v_user_id` produced. Each assertion compares against C's own
    -- loan and against zero, never against A's amounts.
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_c)::text, true);

    -- fn_saneamiento_plan
    SELECT count(*), COALESCE(SUM(p.saldo_pendiente), 0) INTO v_n, v_suma
    FROM public.fn_saneamiento_plan('math') p;
    INSERT INTO t_resultado VALUES (25, 'L4 saneamiento_plan: C sin hogar ve solo su propia deuda',
        (v_n = 1 AND v_suma = 700), format('filas=%s suma=%s', v_n, v_suma));

    -- fn_saneamiento_progreso
    SELECT count(*), COALESCE(SUM(g.saldo_pendiente), 0) INTO v_n, v_suma
    FROM public.fn_saneamiento_progreso() g;
    INSERT INTO t_resultado VALUES (26, 'L4 saneamiento_progreso: C sin hogar solo acumula lo propio',
        (v_n = 1 AND v_suma = 700), format('filas=%s saldo=%s', v_n, v_suma));

    -- fn_saneamiento_simular: own loan works, the co-owned one of A is out of reach
    BEGIN
        SELECT (public.fn_saneamiento_simular(v_propio_c, 100)->>'saldo_pendiente')::numeric INTO v_saldo;
        INSERT INTO t_resultado VALUES (27, 'L4 saneamiento_simular: C simula sobre lo propio',
            (v_saldo = 700), format('saldo_pendiente=%s', v_saldo));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (27, 'L4 saneamiento_simular: C simula sobre lo propio',
            false, 'mensaje=' || v_msg);
    END;

    BEGIN
        PERFORM public.fn_saneamiento_simular(v_compart, 100);
        INSERT INTO t_resultado VALUES (28, 'L4 saneamiento_simular: C no simula sobre la deuda de otro hogar',
            false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (28, 'L4 saneamiento_simular: C no simula sobre la deuda de otro hogar',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- fn_simular_pago_extra
    BEGIN
        PERFORM public.fn_simular_pago_extra(v_compart, 100);
        INSERT INTO t_resultado VALUES (29, 'L4 simular_pago_extra: C no simula sobre la deuda de otro hogar',
            false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (29, 'L4 simular_pago_extra: C no simula sobre la deuda de otro hogar',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- fn_reporte_plan_ataque_deudas
    SELECT count(*), COALESCE(SUM(d.saldo_pendiente), 0) INTO v_n, v_suma
    FROM public.fn_reporte_plan_ataque_deudas('matematico') d;
    INSERT INTO t_resultado VALUES (30, 'L4 plan_ataque: C sin hogar solo ve su propia deuda',
        (v_n = 1 AND v_suma = 700), format('filas=%s saldo=%s', v_n, v_suma));

    -- fn_reporte_mapa_acreedores cannot be executed today: its body reads
    -- p_compromisos_tarjeta.posicion_cuota, a column that does not exist (the table has
    -- compromiso_id, tarjeta_id, user_id, monto_cuota, mes_periodo, pagado, creado_at).
    -- That defect is pre-existing — the deployed body already carried it before this
    -- change — and fixing it means deciding what the report should add up, which is not
    -- this task. What can be asserted here is that both of its loan predicates are the
    -- private-or-co-owned one.
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_reporte_mapa_acreedores'
      AND position('(user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))'
                   IN pg_get_functiondef(p.oid)) > 0
      AND position('(p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))'
                   IN pg_get_functiondef(p.oid)) > 0;
    INSERT INTO t_resultado VALUES (31, 'L4 mapa_acreedores: sus dos predicados de prestamos son privado-o-coposeido (no ejecutable por un defecto previo: posicion_cuota)',
        (v_n = 1), format('definiciones con ambos predicados=%s', v_n));

    -- fn_reporte_bola_nieve_estado (it seeds p_config_bola_nieve; rolled back with the rest)
    BEGIN
        SELECT (public.fn_reporte_bola_nieve_estado()->>'deuda_total')::numeric INTO v_saldo;
        INSERT INTO t_resultado VALUES (32, 'L4 bola_nieve: C sin hogar solo suma su propia deuda',
            (v_saldo = 700), format('deuda_total=%s', v_saldo));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (32, 'L4 bola_nieve: C sin hogar solo suma su propia deuda',
            false, 'mensaje=' || v_msg);
    END;

    -- fn_reporte_escudo_tiempo
    BEGIN
        SELECT e.deuda_total INTO v_saldo FROM public.fn_reporte_escudo_tiempo() e LIMIT 1;
        INSERT INTO t_resultado VALUES (33, 'L4 escudo: C sin hogar solo computa su propia deuda',
            (v_saldo = 700), format('deuda_total=%s', v_saldo));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (33, 'L4 escudo: C sin hogar solo computa su propia deuda',
            false, 'mensaje=' || v_msg);
    END;

    -- fn_reporte_podadora_bcg
    BEGIN
        SELECT (public.fn_reporte_podadora_bcg()->'linea_base'->>'deuda_total')::numeric INTO v_saldo;
        INSERT INTO t_resultado VALUES (34, 'L4 podadora: C sin hogar solo computa su propia deuda',
            (v_saldo = 700), format('deuda_total=%s', v_saldo));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (34, 'L4 podadora: C sin hogar solo computa su propia deuda',
            false, 'mensaje=' || v_msg);
    END;

    -- fn_reporte_score_salud_financiera
    BEGIN
        SELECT (public.fn_reporte_score_salud_financiera()->'datos_detalle'->>'deuda_total')::numeric INTO v_saldo;
        INSERT INTO t_resultado VALUES (35, 'L4 score: C sin hogar solo computa su propia deuda',
            (v_saldo = 700), format('deuda_total=%s', v_saldo));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (35, 'L4 score: C sin hogar solo computa su propia deuda',
            false, 'mensaje=' || v_msg);
    END;

    -- fn_reporte_patrimonio_neto_consolidado
    BEGIN
        SELECT (public.fn_reporte_patrimonio_neto_consolidado()->'actual'->>'pasivo_total_ars')::numeric INTO v_saldo;
        INSERT INTO t_resultado VALUES (36, 'L4 patrimonio: C sin hogar solo computa su propio pasivo',
            (v_saldo = 700), format('pasivo_total_ars=%s', v_saldo));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (36, 'L4 patrimonio: C sin hogar solo computa su propio pasivo',
            false, 'mensaje=' || v_msg);
    END;

    -- fn_reporte_timeline_proyeccion: C has no installment rows at all
    SELECT COALESCE(SUM(t.total_prestamos), 0) INTO v_suma
    FROM public.fn_reporte_timeline_proyeccion() t;
    INSERT INTO t_resultado VALUES (37, 'L4 timeline: C sin hogar no arrastra cuotas de prestamos ajenos',
        (v_suma = 0), format('total_prestamos=%s', v_suma));
END $$;

SELECT orden, assertion, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado, detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
