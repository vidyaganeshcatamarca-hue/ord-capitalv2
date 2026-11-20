-- Transactional verification of T21 read half: the read layer projects the loan's
-- counterparty member (p_prestamos.contraparte_user_id), which is what lets the Partner
-- screen list "the loans whose counterparty is the other member" without matching names.
--
-- Runs inside BEGIN ... ROLLBACK with throwaway users created here. No real user's rows
-- are read or locked.
--
-- Fixture:
--   A and B share household H1 (A creador, B invitado)
--   C and D share household H2 (another household, unrelated)
--   E belongs to no household
--
-- Proves:
--   C1  a co-owned loan whose counterparty is B is listed with B's id and name, for A
--   C2  the same row, same id, same name, for B: co-ownership means B reads it too
--   C3  fn_prestamo_detalle returns the same two values for that loan, to A and to B
--   C4  a PRIVATE loan of A naming B as counterparty is visible to A with the same two
--       values (private vs co-owned does not change what the columns hold)
--   C5  the same private loan is NOT visible to B, neither in the list nor in the detail
--   C6  C, member of another household, reads neither of A's loans
--   C7  E, member of no household, gets exactly its own rows: the new columns are NULL
--       and every pre-existing column keeps the value it had before this change
--   C8  the classification the client cannot make itself: contraparte_integrante is true
--       only when the counterparty is a member of the caller's household and is not the
--       caller, and false in the four other cases
--
-- The rows of the second group are never netted against anything: this suite asserts
-- membership and values per row, never a balance.

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
    v_auth_e uuid := gen_random_uuid();
    v_a     bigint;
    v_b     bigint;
    v_c     bigint;
    v_d     bigint;
    v_e     bigint;
    v_nombre_a text;
    v_nombre_b text;
    v_nombre_c text;
    v_hogar     bigint;
    v_hogar_2   bigint;
    v_coposeido bigint;
    v_privado   bigint;
    v_propio_e  bigint;
    v_privado_ext   bigint;
    v_propio_c_2    bigint;
    v_propio_e_2    bigint;
    v_sin_contrap   bigint;
    v_n         integer;
    v_id        bigint;
    v_nombre    text;
    v_txt       text;
    v_num       numeric;
    v_bool      boolean;
    v_json      jsonb;
    v_msg       text;
    v_fila      record;
BEGIN
    -- ---- fixture: A and B share H1; C and D share H2; E has no household ---------
    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_a, 'TEST_CONTRAP_A', 'test_contrap_a_' || left(replace(v_auth_a::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_a;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_b, 'TEST_CONTRAP_B', 'test_contrap_b_' || left(replace(v_auth_b::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_b;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_c, 'TEST_CONTRAP_C', 'test_contrap_c_' || left(replace(v_auth_c::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_c;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_d, 'TEST_CONTRAP_D', 'test_contrap_d_' || left(replace(v_auth_d::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_d;

    INSERT INTO public.usuarios (auth_id, nombre, login, password, creado_at, modo_app)
    VALUES (v_auth_e, 'TEST_CONTRAP_E', 'test_contrap_e_' || left(replace(v_auth_e::text, '-', ''), 8),
            'x', now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_e;

    IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL OR v_d IS NULL OR v_e IS NULL THEN
        INSERT INTO t_resultado VALUES (0, 'setup', false, 'no se pudieron crear los usuarios descartables');
        RETURN;
    END IF;

    v_nombre_a := 'TEST_CONTRAP_A';
    v_nombre_b := 'TEST_CONTRAP_B';
    v_nombre_c := 'TEST_CONTRAP_C';

    INSERT INTO public.p_hogares (nombre_hogar, porcentaje_usuario_creador, porcentaje_usuario_invitado)
    VALUES ('TEST_CONTRAP_Hogar1', 50, 50)
    RETURNING hogar_id INTO v_hogar;

    INSERT INTO public.p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar, v_a, 'creador'), (v_hogar, v_b, 'invitado');

    INSERT INTO public.p_hogares (nombre_hogar, porcentaje_usuario_creador, porcentaje_usuario_invitado)
    VALUES ('TEST_CONTRAP_Hogar2', 50, 50)
    RETURNING hogar_id INTO v_hogar_2;

    INSERT INTO public.p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar_2, v_c, 'creador'), (v_hogar_2, v_d, 'invitado');

    INSERT INTO t_resultado VALUES (1, 'setup: A y B en un hogar, C en otro, E sin hogar',
        (v_hogar IS NOT NULL AND v_hogar_2 IS NOT NULL AND v_hogar <> v_hogar_2),
        format('A=%s B=%s C=%s E=%s hogar1=%s hogar2=%s', v_a, v_b, v_c, v_e, v_hogar, v_hogar_2));

    -- ---- A registers a co-owned loan naming B as the counterparty ---------------
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    v_coposeido := public.fn_prestamo_crear(
        p_direccion           => 'debo',
        p_contraparte         => 'TEST_CONTRAP_Compartido',
        p_moneda              => 'ARS',
        p_monto_original      => 2500,
        p_modalidad           => 'libre',
        p_es_historico        => true,
        p_hogar_id            => v_hogar,
        p_contraparte_user_id => v_b);

    -- A also registers a private loan (no household) naming B as the counterparty.
    v_privado := public.fn_prestamo_crear(
        p_direccion           => 'debo',
        p_contraparte         => 'TEST_CONTRAP_Privado',
        p_moneda              => 'USD',
        p_monto_original      => 800,
        p_modalidad           => 'libre',
        p_es_historico        => true,
        p_contraparte_user_id => v_b);

    INSERT INTO t_resultado VALUES (2, 'setup A: una deuda coposeida con B como contraparte y una privada con B como contraparte',
        (v_coposeido IS NOT NULL AND v_privado IS NOT NULL),
        format('coposeido=%s privado=%s', v_coposeido, v_privado));

    -- =======================================================================
    -- C1 — A, the owner of the co-owned loan, reads the counterparty
    -- =======================================================================
    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar(NULL, true) l
    WHERE l.prestamo_id = v_coposeido
      AND l.contraparte_user_id = v_b
      AND l.contraparte_nombre = v_nombre_b;
    INSERT INTO t_resultado VALUES (3, 'C1 listar: A ve la contraparte de la deuda coposeida (id y nombre de B)',
        (v_n = 1), format('filas que coinciden=%s', v_n));

    SELECT l.contraparte_user_id, l.contraparte_nombre
      INTO v_id, v_nombre
    FROM public.fn_prestamos_listar(NULL, true) l
    WHERE l.prestamo_id = v_coposeido;
    INSERT INTO t_resultado VALUES (4, 'C1 listar: los valores son B y su nombre, no un nulo ni otro integrante',
        (v_id = v_b AND v_nombre = v_nombre_b),
        format('contraparte_user_id=%s contraparte_nombre=%s (esperado %s y %s)',
               v_id, v_nombre, v_b, v_nombre_b));

    -- =======================================================================
    -- C2 — B, the counterparty and co-owner, reads the same row with the same values
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);

    SELECT l.contraparte_user_id, l.contraparte_nombre
      INTO v_id, v_nombre
    FROM public.fn_prestamos_listar(NULL, true) l
    WHERE l.prestamo_id = v_coposeido;
    INSERT INTO t_resultado VALUES (5, 'C2 listar: B ve la deuda coposeida con la contraparte apuntandose a si mismo',
        (v_id = v_b AND v_nombre = v_nombre_b),
        format('contraparte_user_id=%s contraparte_nombre=%s', v_id, v_nombre));

    -- =======================================================================
    -- C3 — the detail returns the same two values, to A and to B
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    BEGIN
        v_json := public.fn_prestamo_detalle(v_coposeido);
        INSERT INTO t_resultado VALUES (6, 'C3 detalle: A recibe contraparte_user_id y contraparte_nombre de la deuda coposeida',
            ((v_json->>'contraparte_user_id')::bigint = v_b
             AND v_json->>'contraparte_nombre' = v_nombre_b),
            format('contraparte_user_id=%s contraparte_nombre=%s',
                   v_json->>'contraparte_user_id', v_json->>'contraparte_nombre'));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (6, 'C3 detalle: A recibe contraparte_user_id y contraparte_nombre de la deuda coposeida',
            false, 'mensaje=' || v_msg);
    END;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);

    BEGIN
        v_json := public.fn_prestamo_detalle(v_coposeido);
        INSERT INTO t_resultado VALUES (7, 'C3 detalle: B recibe los mismos dos valores en la deuda coposeida',
            ((v_json->>'contraparte_user_id')::bigint = v_b
             AND v_json->>'contraparte_nombre' = v_nombre_b),
            format('contraparte_user_id=%s contraparte_nombre=%s',
                   v_json->>'contraparte_user_id', v_json->>'contraparte_nombre'));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (7, 'C3 detalle: B recibe los mismos dos valores en la deuda coposeida',
            false, 'mensaje=' || v_msg);
    END;

    -- =======================================================================
    -- C4 — a private loan naming a counterparty carries the same values
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar(NULL, true) l
    WHERE l.prestamo_id = v_privado
      AND l.contraparte_user_id = v_b
      AND l.contraparte_nombre = v_nombre_b;
    INSERT INTO t_resultado VALUES (8, 'C4 listar: la deuda privada de A declara a B y su nombre igual que la coposeida',
        (v_n = 1), format('filas que coinciden=%s', v_n));

    BEGIN
        v_json := public.fn_prestamo_detalle(v_privado);
        INSERT INTO t_resultado VALUES (9, 'C4 detalle: la deuda privada de A devuelve la contraparte declarada',
            ((v_json->>'contraparte_user_id')::bigint = v_b
             AND v_json->>'contraparte_nombre' = v_nombre_b),
            format('contraparte_user_id=%s contraparte_nombre=%s',
                   v_json->>'contraparte_user_id', v_json->>'contraparte_nombre'));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (9, 'C4 detalle: la deuda privada de A devuelve la contraparte declarada',
            false, 'mensaje=' || v_msg);
    END;

    -- =======================================================================
    -- C5 — being named as counterparty does NOT open the private loan
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar(NULL, true) l
    WHERE l.prestamo_id = v_privado;
    INSERT INTO t_resultado VALUES (10, 'C5 listar: B, nombrado como contraparte, no ve la deuda privada de A',
        (v_n = 0), format('filas=%s', v_n));

    SELECT count(*) INTO v_n FROM public.fn_prestamos_listar(NULL, true) l;
    INSERT INTO t_resultado VALUES (11, 'C5 listar: el listado de B es exactamente las coposeidas, sin la privada de A',
        (v_n = 1), format('filas totales=%s', v_n));

    BEGIN
        PERFORM public.fn_prestamo_detalle(v_privado);
        INSERT INTO t_resultado VALUES (12, 'C5 detalle: B no abre la deuda privada de A aunque figure como contraparte',
            false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (12, 'C5 detalle: B no abre la deuda privada de A aunque figure como contraparte',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- =======================================================================
    -- C6 — a member of another household sees neither row
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_c)::text, true);

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar(NULL, true) l
    WHERE l.prestamo_id IN (v_coposeido, v_privado);
    INSERT INTO t_resultado VALUES (13, 'C6 listar: C, de otro hogar, no ve ninguna de las dos deudas de A',
        (v_n = 0), format('filas=%s', v_n));

    BEGIN
        PERFORM public.fn_prestamo_detalle(v_coposeido);
        INSERT INTO t_resultado VALUES (14, 'C6 detalle: C no abre la deuda coposeida por el hogar de A',
            false, 'no levanto excepcion');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (14, 'C6 detalle: C no abre la deuda coposeida por el hogar de A',
            (v_msg LIKE '%error_debt_not_found%'), 'mensaje=' || v_msg);
    END;

    -- =======================================================================
    -- C7 — a caller with no household: exactly its own rows, and the pre-existing
    -- columns keep the values they had before this change
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_e)::text, true);

    v_propio_e := public.fn_prestamo_crear(
        p_direccion      => 'me_deben',
        p_contraparte    => 'TEST_CONTRAP_E_Prestamista',
        p_nombre         => 'TEST_CONTRAP_PropioE',
        p_moneda         => 'EUR',
        p_monto_original => 1234.56,
        p_modalidad      => 'libre',
        p_es_historico   => true);

    INSERT INTO t_resultado VALUES (15, 'setup E: usuario sin hogar con un prestamo propio y sin contraparte declarada',
        (v_propio_e IS NOT NULL), format('prestamo_e=%s', v_propio_e));

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar(NULL, true) l WHERE l.prestamo_id <> v_propio_e;
    INSERT INTO t_resultado VALUES (16, 'C7 listar: E sin hogar solo ve lo propio',
        (v_n = 0), format('filas ajenas=%s', v_n));

    SELECT count(*) INTO v_n
    FROM public.fn_prestamos_listar(NULL, true) l WHERE l.prestamo_id = v_propio_e;
    INSERT INTO t_resultado VALUES (17, 'C7 listar: E conserva su propia fila',
        (v_n = 1), format('filas propias=%s', v_n));

    SELECT * INTO v_fila
    FROM public.fn_prestamos_listar(NULL, true) l WHERE l.prestamo_id = v_propio_e;

    INSERT INTO t_resultado VALUES (18, 'C7 listar: las columnas previas conservan sus valores (direccion, contraparte, nombre, moneda)',
        (v_fila.direccion = 'me_deben'
         AND v_fila.contraparte = 'TEST_CONTRAP_E_Prestamista'
         AND v_fila.nombre = 'TEST_CONTRAP_PropioE'
         AND v_fila.moneda = 'EUR'),
        format('direccion=%s contraparte=%s nombre=%s moneda=%s',
               v_fila.direccion, v_fila.contraparte, v_fila.nombre, v_fila.moneda));

    INSERT INTO t_resultado VALUES (19, 'C7 listar: las columnas previas conservan sus importes y su estado',
        (v_fila.saldo_pendiente = 1234.56
         AND v_fila.monto_original = 1234.56
         AND v_fila.pagado_registrado = 0
         AND v_fila.estado = 'activo'
         AND v_fila.tiene_cronograma = false
         AND v_fila.proximo_vencimiento IS NULL),
        format('saldo=%s original=%s pagado=%s estado=%s cronograma=%s vencimiento=%s',
               v_fila.saldo_pendiente, v_fila.monto_original, v_fila.pagado_registrado,
               v_fila.estado, v_fila.tiene_cronograma, v_fila.proximo_vencimiento));

    INSERT INTO t_resultado VALUES (20, 'C7 listar: sin contraparte declarada, las dos columnas nuevas son nulas',
        (v_fila.contraparte_user_id IS NULL AND v_fila.contraparte_nombre IS NULL),
        format('contraparte_user_id=%s contraparte_nombre=%s',
               v_fila.contraparte_user_id, v_fila.contraparte_nombre));

    BEGIN
        v_json := public.fn_prestamo_detalle(v_propio_e);
        INSERT INTO t_resultado VALUES (21, 'C7 detalle: sin contraparte declarada, las dos claves nuevas son nulas',
            (v_json->'contraparte_user_id' = 'null'::jsonb
             AND v_json->'contraparte_nombre' = 'null'::jsonb),
            format('contraparte_user_id=%s contraparte_nombre=%s',
                   v_json->>'contraparte_user_id', v_json->>'contraparte_nombre'));
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        INSERT INTO t_resultado VALUES (21, 'C7 detalle: sin contraparte declarada, las dos claves nuevas son nulas',
            false, 'mensaje=' || v_msg);
    END;

    -- The definition itself: the household is derived as the precedent does it, the
    -- private-OR-co-owned predicate is intact, and the two new columns close the
    -- RETURNS TABLE. This is asserted, not assumed, because the function was rebuilt
    -- from scratch by a DROP + CREATE.
    SELECT count(*) INTO v_n
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'fn_prestamos_listar'
      AND pg_get_function_identity_arguments(p.oid) = 'p_direccion text, p_incluir_saldados boolean'
      AND position('SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;'
                   IN pg_get_functiondef(p.oid)) > 0
      AND position('(p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))'
                   IN pg_get_functiondef(p.oid)) > 0
      AND pg_get_function_result(p.oid) LIKE '%contraparte_user_id bigint, contraparte_nombre text%';
    INSERT INTO t_resultado VALUES (22, 'C7 definicion: una sola version, hogar derivado, predicado privado-o-coposeido y las columnas de contraparte al final',
        (v_n = 1), format('definiciones conformes=%s', v_n));

    -- =======================================================================
    -- C8 — contraparte_integrante: the classification only the server can make
    -- =======================================================================
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    -- A private loan of A naming C, who lives in another household, and a loan with no
    -- counterparty declared at all.
    v_privado_ext := public.fn_prestamo_crear(
        p_direccion           => 'debo',
        p_contraparte         => 'TEST_CONTRAP_Externo',
        p_moneda              => 'ARS',
        p_monto_original      => 400,
        p_modalidad           => 'libre',
        p_es_historico        => true,
        p_contraparte_user_id => v_c);

    v_sin_contrap := public.fn_prestamo_crear(
        p_direccion      => 'debo',
        p_contraparte    => 'TEST_CONTRAP_SinContraparte',
        p_moneda         => 'ARS',
        p_monto_original => 150,
        p_modalidad      => 'libre',
        p_es_historico   => true);

    INSERT INTO t_resultado VALUES (23, 'setup A: una privada con contraparte de otro hogar y otra sin contraparte declarada',
        (v_privado_ext IS NOT NULL AND v_sin_contrap IS NOT NULL),
        format('externa=%s sin_contraparte=%s', v_privado_ext, v_sin_contrap));

    -- C8a — co-owned loan of A naming B, a member of A's household: TRUE for A.
    SELECT l.contraparte_integrante INTO v_bool
    FROM public.fn_prestamos_listar(NULL, true) l WHERE l.prestamo_id = v_coposeido;
    INSERT INTO t_resultado VALUES (24, 'C8 listar: verdadero cuando la contraparte es integrante del hogar del llamante (A sobre la coposeida con B)',
        (v_bool IS TRUE), format('contraparte_integrante=%s', v_bool));

    -- C8b — same row, read by B: the counterparty is the caller itself, so FALSE.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_b)::text, true);

    SELECT l.contraparte_integrante INTO v_bool
    FROM public.fn_prestamos_listar(NULL, true) l WHERE l.prestamo_id = v_coposeido;
    INSERT INTO t_resultado VALUES (25, 'C8 listar: falso cuando la contraparte es el propio llamante (B sobre la coposeida que lo nombra)',
        (v_bool IS FALSE), format('contraparte_integrante=%s', v_bool));

    -- C8c — A's private loan naming C, who lives in another household: FALSE.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_a)::text, true);

    SELECT l.contraparte_integrante INTO v_bool
    FROM public.fn_prestamos_listar(NULL, true) l WHERE l.prestamo_id = v_privado_ext;
    INSERT INTO t_resultado VALUES (26, 'C8 listar: falso para una contraparte de otro hogar (A sobre su privada que nombra a C)',
        (v_bool IS FALSE), format('contraparte_integrante=%s', v_bool));

    -- C8d — a loan that declares no counterparty at all: FALSE, and both columns NULL.
    SELECT l.contraparte_integrante, l.contraparte_user_id, l.contraparte_nombre
      INTO v_bool, v_id, v_nombre
    FROM public.fn_prestamos_listar(NULL, true) l WHERE l.prestamo_id = v_sin_contrap;
    INSERT INTO t_resultado VALUES (27, 'C8 listar: falso cuando la deuda no declara contraparte',
        (v_bool IS FALSE AND v_id IS NULL AND v_nombre IS NULL),
        format('contraparte_integrante=%s contraparte_user_id=%s contraparte_nombre=%s',
               v_bool, v_id, v_nombre));

    -- C8e — a member of another household classifying A as counterparty: FALSE.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_c)::text, true);

    v_propio_c_2 := public.fn_prestamo_crear(
        p_direccion           => 'debo',
        p_contraparte         => 'TEST_CONTRAP_C_a_A',
        p_moneda              => 'ARS',
        p_monto_original      => 200,
        p_modalidad           => 'libre',
        p_es_historico        => true,
        p_contraparte_user_id => v_a);

    SELECT l.contraparte_integrante INTO v_bool
    FROM public.fn_prestamos_listar(NULL, true) l WHERE l.prestamo_id = v_propio_c_2;
    INSERT INTO t_resultado VALUES (28, 'C8 listar: falso para un integrante de otro hogar (C nombrando a A)',
        (v_bool IS FALSE), format('contraparte_integrante=%s (prestamo=%s)', v_bool, v_propio_c_2));

    -- C8f — a caller with no household naming a member of somebody else's household: FALSE.
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_auth_e)::text, true);

    v_propio_e_2 := public.fn_prestamo_crear(
        p_direccion           => 'debo',
        p_contraparte         => 'TEST_CONTRAP_E_a_B',
        p_moneda              => 'ARS',
        p_monto_original      => 300,
        p_modalidad           => 'libre',
        p_es_historico        => true,
        p_contraparte_user_id => v_b);

    SELECT l.contraparte_integrante INTO v_bool
    FROM public.fn_prestamos_listar(NULL, true) l WHERE l.prestamo_id = v_propio_e_2;
    INSERT INTO t_resultado VALUES (29, 'C8 listar: falso para el llamante sin hogar, aunque nombre a un integrante de un hogar ajeno',
        (v_bool IS FALSE), format('contraparte_integrante=%s (prestamo=%s)', v_bool, v_propio_e_2));

    -- C8g — the definition: the column closes the RETURNS TABLE, and the classification
    -- lives in the server (a client cannot read p_hogar_participantes).
    SELECT count(*) INTO v_n
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'fn_prestamos_listar'
      AND pg_get_function_result(p.oid) LIKE '%contraparte_user_id bigint, contraparte_nombre text, contraparte_integrante boolean)'
      AND position('FROM public.p_hogar_participantes hp' IN pg_get_functiondef(p.oid)) > 0;
    INSERT INTO t_resultado VALUES (30, 'C8 definicion: contraparte_integrante cierra el RETURNS TABLE y se calcula con p_hogar_participantes en el servidor',
        (v_n = 1), format('definiciones conformes=%s', v_n));
END $$;

SELECT orden, assertion, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado, detalle
FROM t_resultado ORDER BY orden;

ROLLBACK;
