-- Transactional verification of T30 / S31: the Vinculos score of a co-owned loan is the
-- score of the LOAN, not of one member.
--
-- Runs inside BEGIN ... ROLLBACK with throwaway users created here. No real user's rows
-- are read or locked.
--
-- p_prestamos_vinculos is keyed (prestamo_id, criterio) -- PRIMARY KEY, one row per loan
-- and question -- so both co-owners answer the SAME rows. The score computation used to
-- filter that aggregate by the caller, which produced two different wrong answers:
--
--   * partial collision: a criterion both members answer stays owned by the first one, so
--     the second member's SUM is short (observed 5 where the truth is 8);
--   * total collision: the second answerer owns no row at all, the EXISTS is false, and
--     the score is not recomputed.
--
-- Each user answers ONCE per scenario, with the whole questionnaire in a single call,
-- which is how the app uses fn_saneamiento_vinculos_responder: the function deletes the
-- caller's previous answers wholesale ("the questionnaire is a snapshot"), so calling it
-- loan by loan would wipe the caller's own earlier answers and test nothing.
--
-- Proves:
--   V1  co-owned loan, partial collision: A answers criterion 1, B answers 1 and 3, and
--       the stored score is the sum of the distinct criteria answered for the loan.
--       Expected 3 + 5 = 8, read off the weights in the deployed body
--       (CASE WHEN criterio = 3 THEN 5 ELSE 3 END), not copied from a report.
--   V2  private loan: the same score as before the change. One answerer, so the per-user
--       reading and the per-loan reading are the same statement and the value must not
--       move. B's call does not reach it, and does not disturb it.
--   V3  co-owned loan, total collision: every criterion collides onto the first
--       answerer's rows, the second answerer owns none, and the score is STILL
--       recomputed -- from a deliberately staled value it goes back to 8.
--   V4  a caller from a different household cannot answer, and it is not a silent no-op:
--       it raises error_debt_not_found and nothing changes.
--   V5  invariant over the loans of this fixture: the stored puntos_vinculo equals the
--       recomputed sum of that loan's rows, for every one of them.

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    -- Weights, as deployed in fn_saneamiento_vinculos_responder: criterion 3 = 5,
    -- criteria 1 and 2 = 3. Possible totals: 0, 3, 5, 6, 8, 11.
    c_crit_1_2 constant integer := 3;
    c_crit_3   constant integer := 5;

    v_auth_a uuid := gen_random_uuid();
    v_auth_b uuid := gen_random_uuid();
    v_auth_c uuid := gen_random_uuid();
    v_a bigint;
    v_b bigint;
    v_c bigint;
    v_hogar_ab bigint;
    v_hogar_c  bigint;
    v_compart  bigint;   -- co-owned, partial collision
    v_compart2 bigint;   -- co-owned, total collision
    v_privado  bigint;   -- A alone
    v_puntos   smallint;
    v_n        integer;
    v_m        integer;
    v_msg      text;
    v_duenio_1 bigint;
    v_duenio_3 bigint;
    v_esperado integer;
    v_id       bigint;
    v_malos    integer := 0;
    v_revisados integer := 0;
    v_lote     bigint[];
    v_detalle  text := '';
BEGIN
    -- =======================================================================
    -- fixture: A and B share household AB; C belongs to a DIFFERENT household
    -- =======================================================================
    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_a, 'TEST_VIN_A', 'test_vin_a_' || left(replace(v_auth_a::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_a;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_b, 'TEST_VIN_B', 'test_vin_b_' || left(replace(v_auth_b::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_b;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_c, 'TEST_VIN_C', 'test_vin_c_' || left(replace(v_auth_c::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_c;

    IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'no se pudieron crear los usuarios descartables');
        RETURN;
    END IF;

    INSERT INTO public.p_hogares (nombre_hogar, porcentaje_usuario_creador, porcentaje_usuario_invitado)
    VALUES ('TEST_VIN_HogarAB', 50, 50) RETURNING hogar_id INTO v_hogar_ab;
    INSERT INTO public.p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar_ab, v_a, 'creador'), (v_hogar_ab, v_b, 'invitado');

    -- C is unrelated to AB but NOT household-less: this makes V4 exercise the real
    -- `v_hogar_id IS NOT NULL` branch of the predicate, not only its degenerate case.
    INSERT INTO public.p_hogares (nombre_hogar, porcentaje_usuario_creador, porcentaje_usuario_invitado)
    VALUES ('TEST_VIN_HogarC', 50, 50) RETURNING hogar_id INTO v_hogar_c;
    INSERT INTO public.p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar_c, v_c, 'creador');

    -- Everything historical, so creating a loan moves no money and no wallet is needed.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    v_compart := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_VIN_Compartido',
        p_moneda         => 'ARS',
        p_monto_original => 2000,
        p_modalidad      => 'libre',
        p_es_historico   => true,
        p_hogar_id       => v_hogar_ab);

    v_compart2 := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_VIN_Compartido2',
        p_moneda         => 'ARS',
        p_monto_original => 3000,
        p_modalidad      => 'libre',
        p_es_historico   => true,
        p_hogar_id       => v_hogar_ab);

    v_privado := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_VIN_PrivadoA',
        p_moneda         => 'ARS',
        p_monto_original => 1000,
        p_modalidad      => 'libre',
        p_es_historico   => true);

    v_lote := ARRAY[v_compart, v_compart2, v_privado];

    INSERT INTO t_resultado VALUES (1, 'setup: A con dos deudas coposeidas con B y una privada, C en otro hogar; sin respuestas previas',
        (v_compart IS NOT NULL AND v_compart2 IS NOT NULL AND v_privado IS NOT NULL
         AND (SELECT count(*) FROM public.p_prestamos
              WHERE prestamo_id = ANY(v_lote) AND COALESCE(puntos_vinculo, 0) = 0) = 3
         AND (SELECT count(*) FROM public.p_prestamos_vinculos
              WHERE prestamo_id = ANY(v_lote)) = 0),
        format('compartido=%s compartido2=%s privado=%s hogar_ab=%s hogar_c=%s',
               v_compart, v_compart2, v_privado, v_hogar_ab, v_hogar_c));

    -- =======================================================================
    -- V1 step 1 — A answers criterion 1 on the co-owned loan, and 1+3 on its own
    -- =======================================================================
    BEGIN
        v_n := public.fn_saneamiento_vinculos_responder(
            jsonb_build_array(
                jsonb_build_object('prestamo_id', v_compart,  'criterios', jsonb_build_array(1)),
                jsonb_build_object('prestamo_id', v_compart2, 'criterios', jsonb_build_array(1, 3)),
                jsonb_build_object('prestamo_id', v_privado,  'criterios', jsonb_build_array(1, 3))));

        INSERT INTO t_resultado VALUES (2, 'V1 paso 1: A responde criterio 1 en una deuda coposeida y 1+3 en la otra y en la privada',
            (v_n = 3
             AND (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart) = c_crit_1_2
             AND (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart2) = c_crit_1_2 + c_crit_3
             AND (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_privado) = c_crit_1_2 + c_crit_3),
            format('filas=%s puntos: compartido=%s (esperado %s) compartido2=%s privado=%s (esperado %s)',
                   v_n,
                   (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart), c_crit_1_2,
                   (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart2),
                   (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_privado),
                   c_crit_1_2 + c_crit_3));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (2, 'V1 paso 1: A responde criterio 1 en una deuda coposeida y 1+3 en la otra y en la privada',
            false, 'mensaje=' || v_msg);
    END;

    -- =======================================================================
    -- V2 — private loan: the score must not move, and it is one owner's own call
    -- =======================================================================
    INSERT INTO t_resultado VALUES (3, 'V2: prestamo privado respondido por su unico duenio (1+3) conserva el mismo puntaje de siempre',
        ((SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_privado) = c_crit_1_2 + c_crit_3
         AND (SELECT count(*) FROM public.p_prestamos_vinculos
              WHERE prestamo_id = v_privado AND user_id = v_a AND seleccionado) = 2),
        format('puntos=%s (esperado %s = %s+%s) respuestas_del_duenio=%s',
               (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_privado),
               c_crit_1_2 + c_crit_3, c_crit_1_2, c_crit_3,
               (SELECT count(*) FROM public.p_prestamos_vinculos
                WHERE prestamo_id = v_privado AND user_id = v_a)));

    -- =======================================================================
    -- stale the total-collision loan on purpose, so V3 proves a recompute happened:
    -- with the old per-user EXISTS this staled 0 is what would survive B's answers,
    -- because B owns no row of that loan at all.
    -- =======================================================================
    UPDATE public.p_prestamos SET puntos_vinculo = 0 WHERE prestamo_id = v_compart2;

    -- =======================================================================
    -- V1 step 2 / V3 — B, the second owner, answers the whole questionnaire
    -- =======================================================================
    BEGIN
        PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);

        v_esperado := c_crit_1_2 + c_crit_3;   -- 3 + 5 = 8

        v_n := public.fn_saneamiento_vinculos_responder(
            jsonb_build_array(
                jsonb_build_object('prestamo_id', v_compart,  'criterios', jsonb_build_array(1, 3)),
                jsonb_build_object('prestamo_id', v_compart2, 'criterios', jsonb_build_array(1, 3))));

        -- The collision really happens: on the first loan criterion 1 stays owned by A
        -- and criterion 3 is B's -- exactly the shape that used to store 5 instead of 8.
        SELECT max(v.user_id) FILTER (WHERE v.criterio = 1),
               max(v.user_id) FILTER (WHERE v.criterio = 3)
          INTO v_duenio_1, v_duenio_3
        FROM public.p_prestamos_vinculos v WHERE v.prestamo_id = v_compart;

        INSERT INTO t_resultado VALUES (4, 'V1: deuda coposeida, A responde 1 y B responde 1+3 -> el puntaje suma los dos criterios de la deuda',
            (v_n = 2
             AND (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart) = v_esperado
             AND v_duenio_1 = v_a AND v_duenio_3 = v_b
             AND (SELECT count(*) FROM public.p_prestamos_vinculos WHERE prestamo_id = v_compart) = 2),
            format('filas=%s puntos=%s (esperado %s = %s+%s) crit1_de=%s crit3_de=%s respuestas=%s',
                   v_n,
                   (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart),
                   v_esperado, c_crit_1_2, c_crit_3, v_duenio_1, v_duenio_3,
                   (SELECT count(*) FROM public.p_prestamos_vinculos WHERE prestamo_id = v_compart)));

        -- Total collision: B owns none of that loan's rows, yet the score is recomputed
        -- from the staled 0 back to 8.
        INSERT INTO t_resultado VALUES (5, 'V3: colision total (B no posee ninguna fila) y el puntaje igual se recalcula a 8',
            ((SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart2) = v_esperado
             AND (SELECT count(*) FROM public.p_prestamos_vinculos
                  WHERE prestamo_id = v_compart2 AND user_id = v_b) = 0
             AND (SELECT count(*) FROM public.p_prestamos_vinculos WHERE prestamo_id = v_compart2) = 2),
            format('puntos=%s (esperado %s, era 0) filas_de_B=%s respuestas=%s',
                   (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart2),
                   v_esperado,
                   (SELECT count(*) FROM public.p_prestamos_vinculos
                    WHERE prestamo_id = v_compart2 AND user_id = v_b),
                   (SELECT count(*) FROM public.p_prestamos_vinculos WHERE prestamo_id = v_compart2)));

        -- B's snapshot is scoped to B: A's private loan keeps its score and its rows.
        INSERT INTO t_resultado VALUES (6, 'V2: la respuesta de B no alcanza ni altera el prestamo privado de A',
            ((SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_privado) = v_esperado
             AND (SELECT count(*) FROM public.p_prestamos_vinculos
                  WHERE prestamo_id = v_privado AND user_id = v_a AND seleccionado) = 2),
            format('puntos=%s (esperado %s) respuestas_del_duenio=%s',
                   (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_privado), v_esperado,
                   (SELECT count(*) FROM public.p_prestamos_vinculos WHERE prestamo_id = v_privado AND user_id = v_a)));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (4, 'V1/V3: B responde la deuda coposeida', false, 'mensaje=' || v_msg);
    END;

    -- =======================================================================
    -- V4 — a caller from another household cannot answer
    -- =======================================================================
    BEGIN
        v_esperado := (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart);
        SELECT count(*) INTO v_m FROM public.p_prestamos_vinculos WHERE prestamo_id = v_compart;

        PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_c)::text, true);
        PERFORM public.fn_saneamiento_vinculos_responder(
            jsonb_build_array(jsonb_build_object('prestamo_id', v_compart, 'criterios', jsonb_build_array(2))));

        INSERT INTO t_resultado VALUES (7, 'V4: un llamante de otro hogar no responde los vinculos de una deuda ajena', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (7, 'V4: un llamante de otro hogar no responde los vinculos de una deuda ajena',
            (v_msg LIKE '%error_debt_not_found%'
             AND (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart) = v_esperado
             AND (SELECT count(*) FROM public.p_prestamos_vinculos WHERE prestamo_id = v_compart) = v_m),
            format('%s puntos=%s (intacto %s) respuestas=%s (intactas %s)', v_msg,
                   (SELECT puntos_vinculo FROM public.p_prestamos WHERE prestamo_id = v_compart), v_esperado,
                   (SELECT count(*) FROM public.p_prestamos_vinculos WHERE prestamo_id = v_compart), v_m));
    END;

    -- =======================================================================
    -- V5 — invariant: stored score = recomputed sum, for every loan of the fixture
    -- =======================================================================
    FOREACH v_id IN ARRAY v_lote LOOP
        SELECT p.puntos_vinculo,
               COALESCE((
                   SELECT SUM(CASE WHEN v.criterio = 3 THEN c_crit_3 ELSE c_crit_1_2 END)::smallint
                   FROM public.p_prestamos_vinculos v
                   WHERE v.prestamo_id = p.prestamo_id AND v.seleccionado), 0)
          INTO v_puntos, v_esperado
        FROM public.p_prestamos p WHERE p.prestamo_id = v_id;

        v_revisados := v_revisados + 1;
        IF COALESCE(v_puntos, 0) <> v_esperado THEN
            v_malos := v_malos + 1;
        END IF;
        v_detalle := v_detalle || format(' [%s: guardado=%s esperado=%s]', v_id, v_puntos, v_esperado);
    END LOOP;

    INSERT INTO t_resultado VALUES (8, 'V5: para cada prestamo del fixture, puntos_vinculo = suma de los criterios respondidos de ese prestamo',
        (v_malos = 0 AND v_revisados = 3),
        format('prestamos=%s con puntaje inconsistente=%s%s', v_revisados, v_malos, v_detalle));
END $$;

SELECT orden, assertion,
       CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
