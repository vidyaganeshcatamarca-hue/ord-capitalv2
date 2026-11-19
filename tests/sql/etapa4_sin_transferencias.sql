-- Etapa 4 · en libertad no hay transferencias. Prueba en transaccion.
-- A · libertad: la transferencia se rechaza con su clave, no con un error generico.
-- B · libertad: la lista de origenes viene vacia, asi la pantalla no ofrece la accion.
-- C · base cero: sigue funcionando igual que antes (la guarda no lo alcanza).
DO $t$
DECLARE
    v_uid_lib bigint; v_jwt_lib text;
    v_uid_bc bigint; v_jwt_bc text;
    v_ciclo date := date_trunc('month', CURRENT_DATE)::date;
    v_origen bigint; v_destino bigint;
    v_clave text; v_mensaje text;
    v_lista int; v_lista_bc int;
    r jsonb := '[]'::jsonb;
BEGIN
    -- Una sola cuenta designada; el modo se alterna dentro de la transaccion, que es
    -- justo lo que la prueba compara. Nada de elegir usuarios por orden.
    SELECT u.user_id, u.auth_id::text INTO v_uid_lib, v_jwt_lib
      FROM public.usuarios u
     WHERE u.user_id = {{USUARIO}} AND u.auth_id IS NOT NULL;
    IF v_uid_lib IS NULL THEN RAISE EXCEPTION 'la cuenta de prueba {{USUARIO}} no existe o no tiene auth_id'; END IF;
    v_uid_bc := v_uid_lib;
    v_jwt_bc := v_jwt_lib;

    SELECT e.estructura_id INTO v_origen
      FROM public.p_estructuras_egresos e
     WHERE e.user_id = v_uid_lib AND e.padre_id IS NULL
     ORDER BY e.estructura_id LIMIT 1;
    SELECT e.estructura_id INTO v_destino
      FROM public.p_estructuras_egresos e
     WHERE e.user_id = v_uid_lib AND e.estructura_id <> v_origen
     ORDER BY e.estructura_id LIMIT 1;
    IF v_origen IS NULL OR v_destino IS NULL THEN RAISE EXCEPTION 'faltan rubros'; END IF;

    -- A · el rechazo llega con su clave
    UPDATE public.p_presupuestos_config SET modo_presupuesto = 'anticipado' WHERE user_id = v_uid_lib;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_jwt_lib, 'role', 'authenticated')::text, true);
    BEGIN
        PERFORM public.fn_transferir_entre_sobres(v_origen, v_destino, 100, v_ciclo, NULL);
        v_clave := 'NO_RECHAZO';
    EXCEPTION WHEN OTHERS THEN
        v_mensaje := SQLERRM;
        v_clave := COALESCE((v_mensaje::jsonb ->> 'key'), 'SIN_CLAVE');
    END;
    r := r || jsonb_build_object('caso', 'A libertad rechaza la transferencia', 'ok',
        (v_clave = 'error_transfer_only_base_zero'), 'clave', v_clave, 'mensaje', v_mensaje);

    -- B · la lista de origenes vacia, para que la pantalla no la ofrezca
    SELECT count(*) INTO v_lista FROM public.fn_disponibles_transferibles(v_ciclo);
    r := r || jsonb_build_object('caso', 'B libertad no ofrece origenes', 'ok',
        (v_lista = 0), 'origenes', v_lista);

    -- C · base cero pasa la guarda del modo: intenta transferir de mas y lo que falla
    -- es el saldo, no el modo. Asi se prueba que la guarda nueva no lo alcanza.
    UPDATE public.p_presupuestos_config SET modo_presupuesto = 'base_cero' WHERE user_id = v_uid_bc;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_jwt_bc, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_lista_bc FROM public.fn_disponibles_transferibles(v_ciclo);
    SELECT e.estructura_id INTO v_origen
      FROM public.p_estructuras_egresos e
     WHERE e.user_id = v_uid_bc AND e.padre_id IS NULL
     ORDER BY e.estructura_id LIMIT 1;
    SELECT e.estructura_id INTO v_destino
      FROM public.p_estructuras_egresos e
     WHERE e.user_id = v_uid_bc AND e.estructura_id <> v_origen
     ORDER BY e.estructura_id LIMIT 1;
    v_clave := 'SIN_LLAMADA';
    IF v_origen IS NOT NULL AND v_destino IS NOT NULL THEN
        BEGIN
            PERFORM public.fn_transferir_entre_sobres(v_origen, v_destino, 999999999, v_ciclo, NULL);
            v_clave := 'NO_RECHAZO';
        EXCEPTION WHEN OTHERS THEN
            v_clave := COALESCE((SQLERRM::jsonb ->> 'key'), 'SIN_CLAVE');
        END;
    END IF;
    r := r || jsonb_build_object('caso', 'C base cero pasa la guarda del modo', 'ok',
        (v_clave <> 'error_transfer_only_base_zero'), 'clave', v_clave,
        'origenes', v_lista_bc, 'usuario', v_uid_bc);

    RAISE EXCEPTION 'RESULTADO %', r::text;
END;
$t$;
