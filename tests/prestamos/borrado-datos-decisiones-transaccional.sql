-- borrado-datos-decisiones-transaccional.sql
--
-- Decisions of the owner on the self-service reset (chapter 5 of the closure diagnosis),
-- proved against the body that 20261122a_borrado_datos_decisiones_aprobadas.sql produces.
--
-- Everything here runs inside ONE transaction and ends in ROLLBACK. With the migration
-- not applied yet, run suite and migration together in a single rolled-back transaction:
--
--   node tests/prestamos/run-migracion-sin-aplicar.mjs \
--        supabase/migrations/20261122a_borrado_datos_decisiones_aprobadas.sql \
--        tests/prestamos/borrado-datos-decisiones-transaccional.sql
--
-- Once the migration is applied, the same file runs on its own:
--
--   node tests/prestamos/run-transaccional.mjs tests/prestamos/borrado-datos-decisiones-transaccional.sql
--
-- Fixtures are disposable users (gen_random_uuid, creado_at pushed back, modo_app set), so
-- nothing depends on a live account and nothing survives the ROLLBACK.

BEGIN;

CREATE TEMP TABLE _decisiones_resultado (clave text, valor text) ON COMMIT DROP;

DO $test$
DECLARE
    v_auth_a      uuid := gen_random_uuid();
    v_auth_b      uuid := gen_random_uuid();
    v_auth_c      uuid := gen_random_uuid();
    v_a           bigint;
    v_b           bigint;
    v_c           bigint;
    v_email       text := 'reset.a@example.test';
    v_res         jsonb;
    v_n           bigint;
    v_uid         bigint;
    v_txt         text;
    v_cierre      bigint;
    v_legal1      bigint;
    v_legal2      bigint;
    v_reporte     bigint;
    v_feedback    bigint;
    v_ref_entra   bigint;
    v_ref_sale    bigint;
    v_sugerida    bigint;
BEGIN
    -- -------------------------------------------------------------- fixtures
    INSERT INTO public.usuarios (nombre, login, password, auth_id, creado_at, modo_app, email)
    VALUES ('__reset_a__', '__reset_a__' || replace(v_auth_a::text, '-', ''), 'x',
            v_auth_a, now() - interval '30 days', 'simple', v_email)
    RETURNING user_id INTO v_a;

    INSERT INTO public.usuarios (nombre, login, password, auth_id, creado_at, modo_app, email)
    VALUES ('__reset_b__', '__reset_b__' || replace(v_auth_b::text, '-', ''), 'x',
            v_auth_b, now() - interval '30 days', 'simple', 'reset.b@example.test')
    RETURNING user_id INTO v_b;

    INSERT INTO public.usuarios (nombre, login, password, auth_id, creado_at, modo_app, email)
    VALUES ('__reset_c__', '__reset_c__' || replace(v_auth_c::text, '-', ''), 'x',
            v_auth_c, now() - interval '30 days', 'simple', 'reset.c@example.test')
    RETURNING user_id INTO v_c;

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_auth_a, 'role', 'service_role')::text, true);

    INSERT INTO public.p_pin_seguridad (user_id, pin_hash, estado, intentos_fallidos,
                                        pin_ultimo_cambio)
    VALUES (v_a, extensions.crypt('1234', extensions.gen_salt('bf')), 'activa', 0,
            now() - interval '25 hours');

    -- C1: the table with no foreign key at all - the silent hole.
    INSERT INTO public.p_presupuestos_cierre
        (user_id, mes_periodo, estructura_egreso_id, tipo,
         monto_limite, monto_gastado, saldo_cierre)
    VALUES (v_a, date '2026-10-01', 0, 'cierre', 100, 40, 60)
    RETURNING cierre_id INTO v_cierre;

    -- C3: consent records, conserved whole.
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    VALUES (v_a, 'terminos', 'aceptado', 'v1') RETURNING id INTO v_legal1;
    INSERT INTO public.p_legal_consentimientos (user_id, doc_type, evento, version)
    VALUES (v_a, 'privacidad', 'aceptado', 'v1') RETURNING id INTO v_legal2;

    -- C4: a report, conserved whole with its usuario_id.
    INSERT INTO public.app_reportes (usuario_id, titulo, descripcion)
    VALUES (v_a, '__reset_reporte__', 'no puedo ver el detalle')
    RETURNING reporte_id INTO v_reporte;

    -- C7: feedback with an address in the prose and in the free-form bag.
    INSERT INTO public.p_feedback_usuario (user_id, tipo, mensaje, metadata)
    VALUES (v_a, 'bug',
            'no puedo entrar, escribime a ana.perez@example.com o al +54 11 5555-1234',
            jsonb_build_object('account_email', v_email, 'device', 'pixel'))
    RETURNING feedback_id INTO v_feedback;

    -- C8: B invited A, so A is the invited side and the typed address is A's (in another
    -- case on purpose); A invited C, so the benefit of that row belongs to C.
    INSERT INTO public.p_referidos
        (user_id_invitador, codigo_referido, user_id_invitado, email_invitado,
         completado_onboarding, suscrito_premium, beneficio_aplicado)
    VALUES (v_b, '__COD_B__', v_a, upper(v_email), true, true, true)
    RETURNING referido_id INTO v_ref_entra;

    INSERT INTO public.p_referidos
        (user_id_invitador, codigo_referido, user_id_invitado, email_invitado,
         completado_onboarding, suscrito_premium, beneficio_aplicado)
    VALUES (v_a, '__COD_A__', v_c, 'invitado.c@example.test', true, false, true)
    RETURNING referido_id INTO v_ref_sale;

    -- C9: the shared mapping, already anonymous by design.
    INSERT INTO public.p_ia_global_suggestions (termino_clave, usuario_que_sugirio)
    VALUES ('__reset_fixture__', v_a) RETURNING suggestion_id INTO v_sugerida;

    INSERT INTO _decisiones_resultado VALUES
        ('fixture', format('user A=%s (cierre %s, reporte %s, feedback %s)',
                           v_a, v_cierre, v_reporte, v_feedback));

    -- -------------------------------------------------------------- the reset
    v_res := public.fn_borrar_datos_usuario('ERASE', '1234');
    IF v_res->>'resultado' IS DISTINCT FROM 'borrado_datos_ok' THEN
        RAISE EXCEPTION 'FALLO: resultado inesperado %', v_res;
    END IF;
    INSERT INTO _decisiones_resultado VALUES ('reset', 'PASS borrado_datos_ok');

    -- -------------------------------------------------------------- C1
    SELECT count(*) INTO v_n FROM public.p_presupuestos_cierre
     WHERE cierre_id = v_cierre OR user_id = v_a;
    IF v_n > 0 THEN
        RAISE EXCEPTION 'FALLO C1: sobrevivieron % cierres de presupuesto', v_n;
    END IF;
    IF position('p_presupuestos_cierre' IN COALESCE(v_res->>'detalle', '')) = 0 THEN
        RAISE EXCEPTION 'FALLO C1: el cierre no aparece en el detalle del borrado';
    END IF;
    INSERT INTO _decisiones_resultado VALUES ('C1_cierre_borrado', 'PASS');

    -- -------------------------------------------------------------- C3
    SELECT count(*) INTO v_n FROM public.p_legal_consentimientos
     WHERE id IN (v_legal1, v_legal2) AND user_id = v_a;
    IF v_n <> 2 THEN
        RAISE EXCEPTION 'FALLO C3: quedan % de 2 consentimientos', v_n;
    END IF;
    IF (v_res->>'detalle') LIKE '%p_legal_consentimientos%' THEN
        RAISE EXCEPTION 'FALLO C3: el borrado toco los consentimientos';
    END IF;
    INSERT INTO _decisiones_resultado VALUES ('C3_consentimientos_conservados', 'PASS');

    -- -------------------------------------------------------------- C4
    SELECT count(*) INTO v_n FROM public.app_reportes
     WHERE reporte_id = v_reporte AND usuario_id = v_a AND titulo = '__reset_reporte__';
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'FALLO C4: el reporte no sobrevivio intacto';
    END IF;
    IF (v_res->>'detalle') LIKE '%app_reportes%' THEN
        RAISE EXCEPTION 'FALLO C4: el borrado toco los reportes';
    END IF;
    INSERT INTO _decisiones_resultado VALUES ('C4_reportes_conservados', 'PASS');

    -- -------------------------------------------------------------- C7
    SELECT count(*) INTO v_n FROM public.p_feedback_usuario f
     WHERE f.feedback_id = v_feedback
       AND (f.user_id IS NOT NULL
            OR f.metadata->>'anonymised_by_data_reset' IS DISTINCT FROM 'true'
            OR f.metadata->>'free_text_verified' IS DISTINCT FROM 'false'
            OR f.metadata ? 'account_email'
            OR f.metadata ? 'device'
            OR f.mensaje ~ '@'
            OR f.mensaje ~ '[0-9]{7,}');
    IF v_n > 0 THEN
        RAISE EXCEPTION 'FALLO C7: el feedback sigue identificando al autor';
    END IF;

    SELECT mensaje INTO v_txt FROM public.p_feedback_usuario WHERE feedback_id = v_feedback;
    IF position('[email]' IN v_txt) = 0 OR position('[phone]' IN v_txt) = 0 THEN
        RAISE EXCEPTION 'FALLO C7: no se reemplazaron los identificadores del texto (%)', v_txt;
    END IF;
    INSERT INTO _decisiones_resultado VALUES ('C7_feedback_anonimizado', 'PASS');

    -- -------------------------------------------------------------- C8, invited side
    SELECT count(*) INTO v_n FROM public.p_referidos
     WHERE referido_id = v_ref_entra
       AND user_id_invitado IS NULL
       AND email_invitado IS NULL
       AND beneficio_aplicado IS TRUE;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'FALLO C8: el lado invitado del referido no quedo anonimizado';
    END IF;
    INSERT INTO _decisiones_resultado VALUES ('C8_referido_invitado_anonimizado', 'PASS');

    -- -------------------------------------------------------------- C8, inviter side
    SELECT user_id_invitador, codigo_referido INTO v_uid, v_txt
      FROM public.p_referidos WHERE referido_id = v_ref_sale;
    SELECT count(*) INTO v_n FROM public.p_referidos
     WHERE referido_id = v_ref_sale AND beneficio_aplicado IS TRUE;

    IF v_uid IS DISTINCT FROM v_a THEN
        RAISE EXCEPTION 'C8 abierto: el invitador ya no es el usuario que reinicio (% en lugar de %)',
            v_uid, v_a;
    END IF;
    IF v_txt IS DISTINCT FROM '__COD_A__' OR v_n <> 1 THEN
        RAISE EXCEPTION 'FALLO C8: se perdio el beneficio de terceros del referido';
    END IF;
    INSERT INTO _decisiones_resultado
    VALUES ('C8_referido_invitador_conservado', 'PASS con la referencia al invitador abierta');

    -- -------------------------------------------------------------- C8, neighbours
    SELECT count(*) INTO v_n FROM public.p_referidos
     WHERE referido_id = v_ref_entra AND user_id_invitador = v_b;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'FALLO C8: se toco el referido de otro usuario';
    END IF;

    -- -------------------------------------------------------------- C9, shared mapping
    SELECT count(*) INTO v_n FROM public.p_ia_global_suggestions
     WHERE suggestion_id = v_sugerida AND usuario_que_sugirio IS NULL
       AND termino_clave = '__reset_fixture__';
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'FALLO C9: el mapeo global no quedo anonimizado';
    END IF;
    INSERT INTO _decisiones_resultado VALUES ('C9_mapeo_global_anonimizado', 'PASS');

    -- -------------------------------------------------------------- the account
    SELECT count(*) INTO v_n FROM public.usuarios WHERE user_id = v_a;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'FALLO: se borro la cuenta';
    END IF;
    SELECT count(*) INTO v_n FROM public.p_preferencias_usuario WHERE user_id = v_a;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'FALLO: p_preferencias_usuario tiene % filas, se esperaba 1', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM public.p_notificaciones_config WHERE user_id = v_a;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'FALLO: p_notificaciones_config tiene % filas, se esperaba 1', v_n;
    END IF;
    INSERT INTO _decisiones_resultado VALUES ('cuenta_viva', 'PASS');

    -- -------------------------------------------------------------- C9, the mechanism
    -- A table nobody decided about must ABORT the reset. Two shapes are simulated, each in
    -- its own savepoint so the failure is contained: a column named user_id with no
    -- foreign key at all (the p_presupuestos_cierre shape), and a column with another name
    -- that only the foreign key to usuarios reveals.
    --
    -- The PIN is set again because the successful reset above deleted it.
    INSERT INTO public.p_pin_seguridad (user_id, pin_hash, estado, intentos_fallidos,
                                        pin_ultimo_cambio)
    VALUES (v_a, extensions.crypt('1234', extensions.gen_salt('bf')), 'activa', 0,
            now() - interval '25 hours');

    CREATE TABLE public.__test_tabla_sin_decision (
        id      bigint NOT NULL,
        user_id bigint NULL
    );
    INSERT INTO public.__test_tabla_sin_decision VALUES (1, v_a);

    BEGIN
        PERFORM public.fn_borrar_datos_usuario('ERASE', '1234');
        RAISE EXCEPTION 'FALLO C9: la tabla nueva paso la verificacion en silencio';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_borrado_incompleto' IN SQLERRM) = 0 THEN RAISE; END IF;
        IF position('__test_tabla_sin_decision' IN SQLERRM) = 0 THEN
            RAISE EXCEPTION 'FALLO C9: aborto, pero sin nombrar la tabla nueva --> %', SQLERRM;
        END IF;
    END;

    DROP TABLE public.__test_tabla_sin_decision;
    INSERT INTO _decisiones_resultado
    VALUES ('C9_tabla_nueva_aborta', 'PASS (tabla con user_id y sin FK)');

    CREATE TABLE public.__test_fk_sin_nombre (
        id     bigint NOT NULL,
        duenio bigint NULL REFERENCES public.usuarios (user_id)
    );
    INSERT INTO public.__test_fk_sin_nombre VALUES (1, v_a);

    BEGIN
        PERFORM public.fn_borrar_datos_usuario('ERASE', '1234');
        RAISE EXCEPTION 'FALLO C9: la tabla con FK a usuarios paso la verificacion';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_borrado_incompleto' IN SQLERRM) = 0 THEN RAISE; END IF;
        IF position('__test_fk_sin_nombre' IN SQLERRM) = 0 THEN
            RAISE EXCEPTION 'FALLO C9: aborto, pero sin nombrar la tabla de la FK --> %', SQLERRM;
        END IF;
    END;

    DROP TABLE public.__test_fk_sin_nombre;
    INSERT INTO _decisiones_resultado
    VALUES ('C9_tabla_con_fk_aborta', 'PASS (columna sin nombre de usuario, FK a usuarios)');

    INSERT INTO _decisiones_resultado VALUES ('veredicto', 'PASS');
END;
$test$;

SELECT clave, valor FROM _decisiones_resultado;
ROLLBACK;
