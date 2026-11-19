-- Self-service reset, whole-account wipe. Transactional: every assertion runs and the
-- script ends in ROLLBACK, so no real row is lost.
--
-- Run with scripts/prestamos/apply-sql.mjs (or query.mjs) against the project.

BEGIN;

CREATE TEMP TABLE _reset_resultado (clave text, valor text) ON COMMIT DROP;

DO $test$
DECLARE
    v_auth   uuid;
    v_uid    bigint;
    v_res    jsonb;
    v_left   bigint;
    v_caja   bigint;
    v_tabla  text;
    v_col    text;
    v_par    text;
    v_lista  text[] := ARRAY[
        'p_caja|user_id', 'p_caja|pagado_por_user_id', 'p_billeteras|user_id',
        'p_sobres|user_id', 'p_sobre_movimientos|user_id',
        'p_sobre_movimientos_auditoria|user_id', 'p_pin_seguridad|user_id',
        'p_recordatorios|user_id', 'p_grupo_familiar|user_id',
        'p_presupuestos_historial|user_id', 'p_notificaciones_enviadas|user_id',
        'p_legal_consentimientos|user_id',
        'p_feedback_usuario|user_id', 'p_app_sessions|user_id',
        'p_telemetry_events|user_id', 'p_telemetry_cps_snapshots|user_id',
        'p_telemetry_user_metrics|user_id', 'p_webhook_queue|user_id',
        'p_referidos|user_id_invitador', 'p_referidos|user_id_invitado',
        'app_reportes|usuario_id', 'app_usuario_bloqueos|usuario_id',
        'p_prestamos|user_id', 'p_prestamos_cuotas|user_id',
        'p_prestamos_pagos|user_id', 'p_prestamos_vinculos|user_id',
        'p_gastos_fijos_config|user_id', 'p_config_inflacion|user_id',
        'p_hogar_participantes|user_id'
    ];
BEGIN
    -- Fixture: a real user old enough to pass the 15-day guard and holding cash rows.
    SELECT u.auth_id, u.user_id INTO v_auth, v_uid
    FROM public.usuarios u
    WHERE u.creado_at < now() - interval '20 days'
      AND EXISTS (SELECT 1 FROM public.p_caja c WHERE c.user_id = u.user_id)
    ORDER BY u.user_id
    LIMIT 1;

    IF v_auth IS NULL THEN
        RAISE EXCEPTION 'fixture: no user with cash rows older than 20 days';
    END IF;

    PERFORM set_config('request.jwt.claims',
        jsonb_build_object('sub', v_auth, 'role', 'service_role')::text, true);

    SELECT count(*) INTO v_caja FROM public.p_caja WHERE user_id = v_uid;
    INSERT INTO _reset_resultado VALUES ('fixture_user', v_uid::text),
                                        ('fixture_p_caja', v_caja::text);

    -- A wrong confirmation must be rejected and must change nothing.
    BEGIN
        PERFORM public.fn_borrar_datos_usuario('BORRAR DATOS');
        RAISE EXCEPTION 'FALLO: se acepto una confirmacion distinta de ERASE';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_confirmation_invalid' in SQLERRM) = 0 THEN
            RAISE;
        END IF;
    END;

    -- The reset itself.
    v_res := public.fn_borrar_datos_usuario('ERASE');
    INSERT INTO _reset_resultado VALUES ('resultado', v_res::text);

    IF v_res->>'resultado' IS DISTINCT FROM 'borrado_datos_ok' THEN
        RAISE EXCEPTION 'FALLO: resultado inesperado %', v_res;
    END IF;
    IF (v_res->>'total_filas_eliminadas')::int <= 0 THEN
        RAISE EXCEPTION 'FALLO: la rutina informo exito sin borrar una sola fila';
    END IF;
    IF (v_res->>'total_filas_eliminadas')::int < v_caja THEN
        RAISE EXCEPTION 'FALLO: borro % filas, menos que las % de p_caja',
            v_res->>'total_filas_eliminadas', v_caja;
    END IF;

    -- Every table must be empty for this user. This is the assertion the deployed body
    -- could never satisfy.
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

    -- The account must still be usable: the signup rows come back, exactly one each.
    -- They are the only two tables a correct reset does not leave empty, so they are
    -- asserted separately instead of in the empty-list loop above.
    SELECT count(*) INTO v_left FROM public.p_preferencias_usuario WHERE user_id = v_uid;
    IF v_left <> 1 THEN
        RAISE EXCEPTION 'FALLO: p_preferencias_usuario tiene % filas, se esperaba 1', v_left;
    END IF;
    SELECT count(*) INTO v_left FROM public.p_notificaciones_config WHERE user_id = v_uid;
    IF v_left <> 1 THEN
        RAISE EXCEPTION 'FALLO: p_notificaciones_config tiene % filas, se esperaba 1', v_left;
    END IF;

    -- Nobody else's data moves.
    SELECT count(*) INTO v_left FROM public.p_caja WHERE user_id <> v_uid;
    IF v_left = 0 THEN
        RAISE EXCEPTION 'FALLO: se borraron movimientos de otros usuarios';
    END IF;

    INSERT INTO _reset_resultado VALUES ('veredicto', 'PASS');
END;
$test$;

SELECT clave, valor FROM _reset_resultado;
ROLLBACK;
