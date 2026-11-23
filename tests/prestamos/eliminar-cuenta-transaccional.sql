-- Account archive, S15 access rule. Transactional: every assertion runs and the script
-- ends in ROLLBACK, so user 20's account is not touched.
--
-- Run with: node scripts/prestamos/query.mjs "$(cat tests/prestamos/eliminar-cuenta-transaccional.sql)"

BEGIN;

CREATE TEMP TABLE _cuenta_resultado (clave text, valor text) ON COMMIT DROP;

DO $test$
DECLARE
    v_uid      bigint := 20;
    v_auth     uuid;
    v_fecha    timestamptz;
    v_dias     numeric;
    v_estado   text;
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

    -- Known starting point, whatever the live row says.
    UPDATE public.usuarios
       SET deleted_at = NULL, estado_cuenta = 'activo'
     WHERE user_id = v_uid;
    DELETE FROM public.p_pin_seguridad WHERE user_id = v_uid;

    -- The confirmation word belongs to the data reset, not to this operation.
    BEGIN
        PERFORM public.fn_eliminar_cuenta_usuario('ERASE');
        RAISE EXCEPTION 'FALLO: acepto la palabra de la otra operacion';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_confirmation_invalid' in SQLERRM) = 0 THEN RAISE; END IF;
    END;

    -- Past the window, no PIN means no archive.
    BEGIN
        PERFORM public.fn_eliminar_cuenta_usuario('DELETE');
        RAISE EXCEPTION 'FALLO: archivo la cuenta sin PIN';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_pin_no_configurado' in SQLERRM) = 0 THEN RAISE; END IF;
    END;

    -- A PIN set moments ago must not authorise it either.
    INSERT INTO public.p_pin_seguridad (user_id, pin_hash, estado, intentos_fallidos,
                                       pin_ultimo_cambio)
    VALUES (v_uid, extensions.crypt('1234', extensions.gen_salt('bf')), 'activa', 0, now());

    BEGIN
        PERFORM public.fn_eliminar_cuenta_usuario('DELETE', '1234');
        RAISE EXCEPTION 'FALLO: archivo con un PIN configurado hace menos de 24 horas';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_pin_espera_24h' in SQLERRM) = 0 THEN RAISE; END IF;
    END;

    -- Wrong PIN, wait over.
    UPDATE public.p_pin_seguridad
       SET pin_ultimo_cambio = now() - interval '25 hours'
     WHERE user_id = v_uid;

    BEGIN
        PERFORM public.fn_eliminar_cuenta_usuario('DELETE', '9999');
        RAISE EXCEPTION 'FALLO: archivo con un PIN incorrecto';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_pin' in SQLERRM) = 0 THEN RAISE; END IF;
    END;

    -- Right PIN: the archive runs and schedules 30 days out.
    v_fecha := public.fn_eliminar_cuenta_usuario('DELETE', '1234');

    SELECT deleted_at, estado_cuenta INTO v_fecha, v_estado
    FROM public.usuarios WHERE user_id = v_uid;

    SELECT round(extract(epoch FROM (v_fecha - now())) / 86400) INTO v_dias;
    INSERT INTO _cuenta_resultado VALUES ('dias_programados', v_dias::text),
                                         ('estado_cuenta', v_estado);

    IF v_dias <> 30 THEN
        RAISE EXCEPTION 'FALLO: programo % dias, se esperaban 30', v_dias;
    END IF;
    IF v_estado IS DISTINCT FROM 'pendiente_eliminacion' THEN
        RAISE EXCEPTION 'FALLO: estado_cuenta quedo en %', v_estado;
    END IF;

    -- And it cannot be scheduled twice.
    BEGIN
        PERFORM public.fn_eliminar_cuenta_usuario('DELETE', '1234');
        RAISE EXCEPTION 'FALLO: archivo dos veces la misma cuenta';
    EXCEPTION WHEN OTHERS THEN
        IF position('error_account_already_scheduled' in SQLERRM) = 0 THEN RAISE; END IF;
    END;

    INSERT INTO _cuenta_resultado VALUES ('veredicto', 'PASS');
END;
$test$;

SELECT clave, valor FROM _cuenta_resultado;
ROLLBACK;
