-- Transactional verification of T29 / S30: sharing per row.
--
-- Runs inside BEGIN ... ROLLBACK with throwaway users created here. No real user's
-- rows are read or locked.
--
-- The model: hogar_id IS NULL means the row belongs to its user_id only (private).
-- hogar_id set means the row is CO-OWNED by that household — the two members own it
-- and both may operate on it. That is not a read-only window into somebody else's
-- private rows.
--
-- Proves:
--   A1  a private row stays private: the other member neither lists it nor opens it
--   A2  a co-owned row resolves to the household the other member belongs to, and the
--       read layer now honours that: fn_prestamos_listar hands it to the other member
--       (A2b)
--   A3  fn_prestamo_crear persists p_hogar_id and p_contraparte_user_id
--   A4  fn_prestamo_editar follows the file's convention: null keeps the value, the
--       explicit p_limpiar_* flags clear it
--   A5  fn_clonar_usuario_admin leaves hogar_id and contraparte_user_id NULL and does
--       not crash on a loan that carries a counterparty

BEGIN;

CREATE TEMP TABLE t_resultado (
    orden integer, assertion text, ok boolean, detalle text
) ON COMMIT DROP;

DO $$
DECLARE
    v_auth_a   uuid := gen_random_uuid();
    v_auth_b   uuid := gen_random_uuid();
    v_a        bigint;
    v_b        bigint;
    v_hogar    bigint;
    v_privado  bigint;
    v_compart  bigint;
    v_tmp      bigint;
    v_hid      bigint;
    v_cid      bigint;
    v_n        integer;
    v_msg      text;
BEGIN
    -- ---- fixture: two throwaway users and one household -------------------
    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_a, 'TEST_T29_A', 'test_t29_a_' || left(replace(v_auth_a::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_a;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_b, 'TEST_T29_B', 'test_t29_b_' || left(replace(v_auth_b::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_b;

    IF v_a IS NULL OR v_b IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'no se pudieron crear los usuarios descartables');
        RETURN;
    END IF;

    INSERT INTO public.p_hogares (nombre_hogar, porcentaje_usuario_creador, porcentaje_usuario_invitado)
    VALUES ('TEST_T29_Hogar', 50, 50)
    RETURNING hogar_id INTO v_hogar;

    INSERT INTO public.p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar, v_a, 'creador'), (v_hogar, v_b, 'invitado');

    -- ---- A1: A registers a private loan -----------------------------------
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    v_privado := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_T29_Privado',
        p_moneda         => 'ARS',
        p_monto_original => 1000,
        p_modalidad      => 'libre',
        p_es_historico   => true);

    SELECT hogar_id, contraparte_user_id INTO v_hid, v_cid
    FROM public.p_prestamos WHERE prestamo_id = v_privado;

    INSERT INTO t_resultado VALUES (1, 'A1 alta sin hogar: la fila nace privada',
        (v_hid IS NULL AND v_cid IS NULL),
        format('hogar_id=%s contraparte_user_id=%s', v_hid, v_cid));

    -- The other member, with its own claims, must not reach it.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar('debo', true) l WHERE l.prestamo_id = v_privado;
    INSERT INTO t_resultado VALUES (2, 'A1 aislamiento de lo privado: B no lo lista',
        (v_n = 0), format('filas=%s', v_n));

    BEGIN
        PERFORM public.fn_prestamo_detalle(v_privado);
        INSERT INTO t_resultado VALUES (3, 'A1 aislamiento de lo privado: B no lo abre', false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (3, 'A1 aislamiento de lo privado: B no lo abre',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- ---- A2: A registers a debt co-owned with the household --------------
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    v_compart := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_T29_Compartido',
        p_moneda         => 'ARS',
        p_monto_original => 2000,
        p_modalidad      => 'libre',
        p_es_historico   => true,
        p_hogar_id       => v_hogar);

    -- Copropiedad: the row belongs to the household, and B is one of its members.
    SELECT count(*) INTO v_n
    FROM public.p_prestamos p
    JOIN public.p_hogar_participantes h ON h.hogar_id = p.hogar_id AND h.user_id = v_b
    WHERE p.prestamo_id = v_compart;

    INSERT INTO t_resultado VALUES (4, 'A2 copropiedad: la deuda queda en el hogar del que B es integrante',
        (v_n = 1), format('coincidencias=%s', v_n));

    -- A2b: the read layer honours co-ownership. fn_prestamos_listar resolves the caller's
    -- household and asks for `user_id = v_user_id OR hogar_id = v_hogar_id`, so the other
    -- member of the household does get the co-owned row. Private rows are still private:
    -- A1 above and the copropiedad-lectura suite cover that side.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar('debo', true) l WHERE l.prestamo_id = v_compart;
    INSERT INTO t_resultado VALUES (5, 'A2b la lectura honra la copropiedad: B ve la fila coposeida',
        (v_n = 1), format('B ve la fila coposeida: %s (esperado 1: privado o coposeido por su hogar)', v_n));

    -- ---- A3: crear persists the two new columns --------------------------
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    v_tmp := public.fn_prestamo_crear(
        p_direccion           => 'me_deben',
        p_contraparte         => 'TEST_T29_Contraparte',
        p_moneda              => 'ARS',
        p_monto_original      => 3000,
        p_modalidad           => 'libre',
        p_es_historico        => true,
        p_hogar_id            => v_hogar,
        p_contraparte_user_id => v_b);

    SELECT hogar_id, contraparte_user_id INTO v_hid, v_cid
    FROM public.p_prestamos WHERE prestamo_id = v_tmp;

    INSERT INTO t_resultado VALUES (6, 'A3 crear persiste hogar_id y contraparte_user_id',
        (v_hid = v_hogar AND v_cid = v_b),
        format('hogar_id=%s (esperado %s) contraparte_user_id=%s (esperado %s)', v_hid, v_hogar, v_cid, v_b));

    -- ---- A4: editar keeps the file's convention ---------------------------
    PERFORM public.fn_prestamo_editar(v_privado, p_hogar_id => v_hogar, p_contraparte_user_id => v_b);
    SELECT hogar_id, contraparte_user_id INTO v_hid, v_cid
    FROM public.p_prestamos WHERE prestamo_id = v_privado;
    INSERT INTO t_resultado VALUES (7, 'A4 editar escribe hogar_id y contraparte_user_id',
        (v_hid = v_hogar AND v_cid = v_b),
        format('hogar_id=%s contraparte_user_id=%s', v_hid, v_cid));

    PERFORM public.fn_prestamo_editar(v_privado, p_nombre => 'TEST_T29_Privado_editado');
    SELECT hogar_id, contraparte_user_id INTO v_hid, v_cid
    FROM public.p_prestamos WHERE prestamo_id = v_privado;
    INSERT INTO t_resultado VALUES (8, 'A4 nulo en edicion no toca lo que ya estaba',
        (v_hid = v_hogar AND v_cid = v_b),
        format('hogar_id=%s contraparte_user_id=%s', v_hid, v_cid));

    PERFORM public.fn_prestamo_editar(v_privado, p_limpiar_hogar => true, p_limpiar_contraparte => true);
    SELECT hogar_id, contraparte_user_id INTO v_hid, v_cid
    FROM public.p_prestamos WHERE prestamo_id = v_privado;
    INSERT INTO t_resultado VALUES (9, 'A4 las banderas explicitas limpian ambos valores',
        (v_hid IS NULL AND v_cid IS NULL),
        format('hogar_id=%s contraparte_user_id=%s', v_hid, v_cid));

    -- ---- A5: the clone cannot inherit them --------------------------------
    DECLARE
        v_origen bigint;
        v_dest   bigint;
        v_res    jsonb;
    BEGIN
        -- Origin without a live auth row: the clone only requires auth.users to
        -- contain the origin's auth_id when that column is set.
        INSERT INTO public.usuarios (nombre, login, password)
        VALUES ('TEST_T29_Origen', 'test_t29_origen_' || left(replace(gen_random_uuid()::text, '-', ''), 8), 'x')
        RETURNING user_id INTO v_origen;

        INSERT INTO public.p_prestamos
            (user_id, entidad_nombre, tipo_flujo, moneda_iso, monto_original,
             monto_total_deuda, estado, saldo_actual, saldo_al_ingreso, modalidad,
             hogar_id, contraparte_user_id)
        VALUES (v_origen, 'TEST_T29_ConContraparte', 'debo', 'ARS', 5000,
                5000, 'activo', 5000, 5000, 'libre', v_hogar, v_b);

        INSERT INTO public.usuarios (nombre, login, password)
        VALUES ('TEST_T29_Destino', 'test_t29_destino_' || left(replace(gen_random_uuid()::text, '-', ''), 8), 'x')
        RETURNING user_id INTO v_dest;

        -- The clone refuses any destination outside this whitelist; the row lives only
        -- inside this transaction.
        INSERT INTO public.admin_clone_destinos_permitidos (destino_user_id, habilitado, descripcion)
        VALUES (v_dest, true, 'test transaccional T29')
        ON CONFLICT (destino_user_id) DO UPDATE SET habilitado = true;

        PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

        BEGIN
            v_res := public.fn_clonar_usuario_admin(v_origen, v_dest, false);
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            INSERT INTO t_resultado VALUES (10, 'A5 el clon no falla con un prestamo con contraparte',
                false, 'fallo: ' || v_msg);
            RETURN;
        END;

        INSERT INTO t_resultado VALUES (10, 'A5 el clon no falla con un prestamo con contraparte',
            (v_res->>'ok')::boolean, 'ok=' || (v_res->>'ok'));

        SELECT count(*) INTO v_n FROM public.p_prestamos WHERE user_id = v_dest;
        SELECT hogar_id, contraparte_user_id INTO v_hid, v_cid
        FROM public.p_prestamos WHERE user_id = v_dest;

        INSERT INTO t_resultado VALUES (11, 'A5 el clon copia el prestamo',
            (v_n = 1), format('prestamos en el destino=%s', v_n));

        INSERT INTO t_resultado VALUES (12, 'A5 el clon deja hogar_id y contraparte_user_id en NULL',
            (v_hid IS NULL AND v_cid IS NULL),
            format('hogar_id=%s contraparte_user_id=%s', v_hid, v_cid));

        -- The origin keeps what it had: the clone reads, it does not drain.
        SELECT hogar_id, contraparte_user_id INTO v_hid, v_cid
        FROM public.p_prestamos WHERE user_id = v_origen;
        INSERT INTO t_resultado VALUES (13, 'A5 el origen conserva sus valores',
            (v_hid = v_hogar AND v_cid = v_b),
            format('hogar_id=%s contraparte_user_id=%s', v_hid, v_cid));
    END;
END $$;

SELECT orden, assertion, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado, detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
