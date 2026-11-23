-- Self-service reset, whole-account wipe.
--
-- Subject: user 20, authorized by the owner for this test. It runs inside a transaction
-- and ends in ROLLBACK, so nothing is lost. The rows that make the test interesting are
-- synthesized here: user 20 has no savings movements and no household, and those are the
-- two cases the deployed body got wrong.
--
-- Updated 2026-11-22 for the owner decisions of chapter 5: the consent records, the reports,
-- the feedback and the referrals are no longer destroyed. The list below no longer names
-- them, and the block at the end proves they come out of the reset unchanged.
-- C7 was inverted later the same day: the feedback is conserved whole, never anonymised.
-- p_presupuestos_cierre joins the list: it carries no foreign key, which is why it used to
-- survive a reset that reported success.
--
-- Run with: node scripts/prestamos/run-transaccional.mjs tests/prestamos/borrado-usuario-transaccional.sql
-- (or, while 20261122a is not applied, through run-migracion-sin-aplicar.mjs)

BEGIN;

CREATE TEMP TABLE _reset_resultado (
    orden int GENERATED ALWAYS AS IDENTITY,
    clave text,
    valor text
) ON COMMIT DROP;

DO $test$
DECLARE
    v_uid     bigint := 20;
    v_auth    uuid;
    v_auth_b  uuid := gen_random_uuid();
    v_otro    bigint;
    v_bill    bigint;
    v_sobre   bigint;
    v_hogar   bigint;
    v_res     jsonb;
    v_left    bigint;
    v_caja    bigint;
    v_legal   bigint;
    v_reportes bigint;
    v_feedback bigint;
    v_referidos bigint;
    v_par     text;
    v_tabla   text;
    v_col     text;
    v_lista   text[] := ARRAY[
        'p_caja|user_id', 'p_caja|pagado_por_user_id', 'p_billeteras|user_id',
        'p_sobres|user_id', 'p_sobre_movimientos|user_id',
        'p_sobre_movimientos_auditoria|user_id', 'p_pin_seguridad|user_id',
        'p_recordatorios|user_id', 'p_grupo_familiar|user_id',
        'p_presupuestos_historial|user_id', 'p_presupuestos_cierre|user_id',
        'p_notificaciones_enviadas|user_id', 'p_app_sessions|user_id',
        'p_telemetry_events|user_id', 'p_telemetry_cps_snapshots|user_id',
        'p_telemetry_user_metrics|user_id', 'p_webhook_queue|user_id',
        'app_usuario_bloqueos|usuario_id', 'p_prestamos|user_id',
        'p_prestamos_cuotas|user_id', 'p_prestamos_pagos|user_id',
        'p_prestamos_vinculos|user_id', 'p_gastos_fijos_config|user_id',
        'p_config_inflacion|user_id', 'p_hogar_participantes|user_id'
    ];
BEGIN
    SELECT u.auth_id INTO v_auth FROM public.usuarios u WHERE u.user_id = v_uid;
    IF v_auth IS NULL THEN
        RAISE EXCEPTION 'fixture: el user % no existe o no tiene auth_id', v_uid;
    END IF;
    IF (SELECT now()::date - creado_at::date FROM public.usuarios WHERE user_id = v_uid) <= 15 THEN
        RAISE EXCEPTION 'fixture: el user % no supera la guarda de 15 dias', v_uid;
    END IF;

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_auth, 'role', 'service_role')::text, true);

    SELECT count(*) INTO v_caja FROM public.p_caja WHERE user_id = v_uid;

    -- Rows the owner decided to conserve: they must come out of the reset untouched.
    SELECT count(*) INTO v_legal FROM public.p_legal_consentimientos WHERE user_id = v_uid;
    SELECT count(*) INTO v_reportes FROM public.app_reportes WHERE usuario_id = v_uid;
    SELECT count(*) INTO v_feedback FROM public.p_feedback_usuario WHERE user_id = v_uid;
    SELECT count(*) INTO v_referidos FROM public.p_referidos
     WHERE user_id_invitador = v_uid OR user_id_invitado = v_uid;

    -- No PIN exists anywhere today (p_pin_seguridad is empty), so this account starts in
    -- the "sent to configure one" state the owner described.
    DELETE FROM public.p_pin_seguridad WHERE user_id = v_uid;

    -- Synthesized chain #1: the RESTRICT that made the deployed body die at p_billeteras.
    INSERT INTO public.p_billeteras (user_id, nombre)
    VALUES (v_uid, 'fixture wallet') RETURNING billetera_id INTO v_bill;

    INSERT INTO public.p_sobres (user_id, nombre, moneda)
    VALUES (v_uid, 'fixture sobre', 'ARS') RETURNING sobre_id INTO v_sobre;

    INSERT INTO public.p_sobre_movimientos (sobre_id, user_id, tipo, importe, moneda,
                                            billetera_id, modalidad)
    VALUES (v_sobre, v_uid, 'aporte', 100, 'ARS', v_bill, 'real');

    -- Synthesized chain #2: a shared household with a second member.
    INSERT INTO public.usuarios (nombre, login, password, auth_id, creado_at, modo_app)
    VALUES ('__reset_fixture_b__', '__reset_fixture_b__' || replace(v_auth_b::text, '-', ''),
            'x', v_auth_b, now() - interval '30 days', 'simple')
    RETURNING user_id INTO v_otro;

    INSERT INTO public.p_hogares DEFAULT VALUES RETURNING hogar_id INTO v_hogar;
    INSERT INTO public.p_hogar_participantes (hogar_id, user_id)
    VALUES (v_hogar, v_uid), (v_hogar, v_otro);
    INSERT INTO public.p_hogar_pagos (hogar_id, monto) VALUES (v_hogar, 50);

    INSERT INTO _reset_resultado (clave, valor) VALUES ('user', v_uid::text),
                                        ('p_caja_antes', v_caja::text),
                                        ('hogar', v_hogar::text);

    -- ---------- assertions ----------
    BEGIN
        PERFORM public.fn_borrar_datos_usuario('BORRAR DATOS');
        RAISE EXCEPTION 'FALLO: se acepto una confirmacion distinta de ERASE';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_confirmation_invalid' in SQLERRM) = 0 THEN RAISE; END IF;
    END;

    -- Past the window the PIN is mandatory: without one the wipe must not happen.
    BEGIN
        PERFORM public.fn_borrar_datos_usuario('ERASE');
        RAISE EXCEPTION 'FALLO: borro sin PIN una cuenta de mas de 15 dias';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_pin_no_configurado' in SQLERRM) = 0 THEN RAISE; END IF;
    END;

    -- A PIN configured moments ago cannot authorise a wipe. Without this wait, whoever
    -- picks up the phone sets a PIN and deletes in the same minute.
    INSERT INTO public.p_pin_seguridad (user_id, pin_hash, estado, intentos_fallidos,
                                       pin_ultimo_cambio)
    VALUES (v_uid, extensions.crypt('1234', extensions.gen_salt('bf')), 'activa', 0, now());

    BEGIN
        PERFORM public.fn_borrar_datos_usuario('ERASE', '1234');
        RAISE EXCEPTION 'FALLO: borro con un PIN configurado hace menos de 24 horas';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_pin_espera_24h' in SQLERRM) = 0 THEN RAISE; END IF;
    END;

    -- Once the wait is over, a wrong PIN still must not pass.
    UPDATE public.p_pin_seguridad
       SET pin_ultimo_cambio = now() - interval '25 hours'
     WHERE user_id = v_uid;

    BEGIN
        PERFORM public.fn_borrar_datos_usuario('ERASE', '9999');
        RAISE EXCEPTION 'FALLO: borro con un PIN incorrecto';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_pin' in SQLERRM) = 0 THEN RAISE; END IF;
    END;

    v_res := public.fn_borrar_datos_usuario('ERASE', '1234');
    INSERT INTO _reset_resultado (clave, valor) VALUES ('resultado', v_res::text);

    IF v_res->>'resultado' IS DISTINCT FROM 'borrado_datos_ok' THEN
        RAISE EXCEPTION 'FALLO: resultado inesperado %', v_res;
    END IF;
    IF (v_res->>'total_filas_eliminadas')::int < v_caja THEN
        RAISE EXCEPTION 'FALLO: borro % filas, menos que las % de p_caja',
            v_res->>'total_filas_eliminadas', v_caja;
    END IF;

    FOREACH v_par IN ARRAY v_lista LOOP
        v_tabla := split_part(v_par, '|', 1);
        v_col   := split_part(v_par, '|', 2);
        CONTINUE WHEN to_regclass('public.' || quote_ident(v_tabla)) IS NULL;
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_tabla, v_col)
           INTO v_left USING v_uid;
        IF v_left > 0 THEN
            RAISE EXCEPTION 'FALLO: quedaron % filas en %.%', v_left, v_tabla, v_col;
        END IF;
    END LOOP;

    -- Recreated on purpose, exactly one each.
    SELECT count(*) INTO v_left FROM public.p_preferencias_usuario WHERE user_id = v_uid;
    IF v_left <> 1 THEN
        RAISE EXCEPTION 'FALLO: p_preferencias_usuario tiene % filas, se esperaba 1', v_left;
    END IF;
    SELECT count(*) INTO v_left FROM public.p_notificaciones_config WHERE user_id = v_uid;
    IF v_left <> 1 THEN
        RAISE EXCEPTION 'FALLO: p_notificaciones_config tiene % filas, se esperaba 1', v_left;
    END IF;

    -- The account itself stays.
    SELECT count(*) INTO v_left FROM public.usuarios WHERE user_id = v_uid;
    IF v_left <> 1 THEN
        RAISE EXCEPTION 'FALLO: se borro la cuenta, el reset solo borra datos';
    END IF;

    -- A shared account is never deleted: the leaving member loses access, the data
    -- stays with the other member.
    SELECT count(*) INTO v_left FROM public.p_hogares WHERE hogar_id = v_hogar;
    IF v_left <> 1 THEN
        RAISE EXCEPTION 'FALLO: se borro el hogar compartido';
    END IF;
    SELECT count(*) INTO v_left FROM public.p_hogar_participantes
     WHERE hogar_id = v_hogar AND user_id = v_otro;
    IF v_left <> 1 THEN
        RAISE EXCEPTION 'FALLO: se borro la pertenencia del otro miembro';
    END IF;
    SELECT count(*) INTO v_left FROM public.p_hogar_pagos WHERE hogar_id = v_hogar;
    IF v_left <> 1 THEN
        RAISE EXCEPTION 'FALLO: se borraron los pagos del hogar compartido';
    END IF;

    -- The rows that survive on purpose (chapter 5, decisions C3, C4, C7 and C8): still
    -- there, and still the same number of them. C7 is inverted since 2026-11-22: the
    -- feedback is conserved whole and is no longer anonymised, so the check is the same
    -- count AND the same author, not "left without user_id".
    SELECT count(*) INTO v_left FROM public.p_legal_consentimientos WHERE user_id = v_uid;
    IF v_left <> v_legal THEN
        RAISE EXCEPTION 'FALLO: los consentimientos pasaron de % a % filas', v_legal, v_left;
    END IF;
    SELECT count(*) INTO v_left FROM public.app_reportes WHERE usuario_id = v_uid;
    IF v_left <> v_reportes THEN
        RAISE EXCEPTION 'FALLO: los reportes pasaron de % a % filas', v_reportes, v_left;
    END IF;
    SELECT count(*) INTO v_left FROM public.p_feedback_usuario WHERE user_id = v_uid;
    IF v_left <> v_feedback THEN
        RAISE EXCEPTION 'FALLO C7 invertido: el feedback paso de % a % filas con el usuario todavia como autor',
            v_feedback, v_left;
    END IF;
    -- C8 suspended: the invited side is cleared by the deployed routine and that behaviour
    -- is documented, not decided.
    SELECT count(*) INTO v_left FROM public.p_referidos WHERE user_id_invitado = v_uid;
    IF v_left > 0 THEN
        RAISE EXCEPTION 'FALLO: quedaron % referidos con el invitado identificado', v_left;
    END IF;
    SELECT count(*) INTO v_left FROM public.p_referidos
     WHERE user_id_invitador = v_uid OR user_id_invitado = v_uid;
    IF v_left <> v_referidos THEN
        RAISE EXCEPTION 'FALLO: los referidos pasaron de % a % filas', v_referidos, v_left;
    END IF;
    INSERT INTO _reset_resultado (clave, valor) VALUES
        ('conservadas', format('legales %s, reportes %s, feedback %s, referidos %s',
                               v_legal, v_reportes, v_feedback, v_referidos));

    -- Nobody else loses rows.
    SELECT count(*) INTO v_left FROM public.p_caja WHERE user_id <> v_uid;
    IF v_left = 0 THEN
        RAISE EXCEPTION 'FALLO: se borraron movimientos de otros usuarios';
    END IF;

    INSERT INTO _reset_resultado (clave, valor) VALUES ('veredicto', 'PASS');
END;
$test$;

SELECT
    orden,
    CASE WHEN valor LIKE 'PASS%' THEN 'PASS'
         WHEN valor LIKE 'FAIL%' THEN 'FAIL'
         ELSE 'INFO' END AS resultado,
    clave AS assertion,
    valor AS detalle
FROM _reset_resultado
ORDER BY orden;
ROLLBACK;
