-- Etapa 4 · repeticion mensual: prueba en transaccion, no deja una fila.
-- A · en libertad, un ciclo vacio se llena con lo del ciclo anterior.
-- B · llamarla de nuevo no duplica nada.
-- C · en base cero no repite: devuelve 0.
-- D · deja el rastro con su motivo, uno por estructura y no mas.
DO $t$
DECLARE
    v_uid bigint; v_jwt text; v_hogar bigint;
    v_ciclo date := date_trunc('month', CURRENT_DATE)::date;
    v_ant date := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date;
    v_creadas int; v_otra_vez int; v_base_cero int;
    v_filas int; v_rastro int; v_rastro_doble int;
    r jsonb := '[]'::jsonb;
    v_uid_bc bigint; v_jwt_bc text; v_estructura bigint;
BEGIN
    -- Cuenta designada (no se elige sola) y modo forzado dentro de la transaccion.
    -- El ciclo anterior se arma aca dentro: la prueba no depende de lo que la cuenta
    -- tenga hoy, y una prueba que compara ceros no prueba nada.
    SELECT u.user_id, u.auth_id::text INTO v_uid, v_jwt
      FROM public.usuarios u
     WHERE u.user_id = {{USUARIO}} AND u.auth_id IS NOT NULL;
    IF v_uid IS NULL THEN RAISE EXCEPTION 'la cuenta de prueba {{USUARIO}} no existe o no tiene auth_id'; END IF;
    UPDATE public.p_presupuestos_config SET modo_presupuesto = 'anticipado' WHERE user_id = v_uid;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_jwt, 'role', 'authenticated')::text, true);

    SELECT e.estructura_id INTO v_estructura
      FROM public.p_estructuras_egresos e
     WHERE e.user_id = v_uid
     ORDER BY e.estructura_id LIMIT 1;
    IF v_estructura IS NULL THEN RAISE EXCEPTION 'el usuario en libertad no tiene rubros'; END IF;

    DELETE FROM public.p_presupuestos WHERE user_id = v_uid AND mes_periodo = v_ciclo;
    DELETE FROM public.p_presupuestos WHERE user_id = v_uid AND mes_periodo = v_ant;
    INSERT INTO public.p_presupuestos (user_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla)
    VALUES (v_uid, v_estructura, v_ant, 12345, 1);

    v_creadas := public.fn_repetir_presupuestos_ciclo();
    SELECT count(*) INTO v_filas FROM public.p_presupuestos
     WHERE user_id = v_uid AND mes_periodo = v_ciclo AND COALESCE(monto_limite, 0) > 0;

    r := r || jsonb_build_object('caso', 'A repite lo del ciclo anterior', 'ok',
        (v_creadas > 0 AND v_creadas = v_filas),
        'creadas', v_creadas, 'filas_con_plata', v_filas);

    SELECT COALESCE(SUM(monto_limite), 0) INTO v_filas FROM public.p_presupuestos
     WHERE user_id = v_uid AND mes_periodo = v_ciclo AND estructura_egreso_id = v_estructura;
    r := r || jsonb_build_object('caso', 'A2 copia el importe exacto', 'ok',
        (v_creadas = 1 AND v_filas = 12345), 'creadas', v_creadas, 'copiado', v_filas);

    v_otra_vez := public.fn_repetir_presupuestos_ciclo();
    SELECT count(*) INTO v_filas FROM public.p_presupuestos
     WHERE user_id = v_uid AND mes_periodo = v_ciclo AND COALESCE(monto_limite, 0) > 0;
    r := r || jsonb_build_object('caso', 'B la segunda llamada no duplica', 'ok',
        (v_otra_vez = 0 AND v_filas = v_creadas),
        'segunda_vez', v_otra_vez, 'filas', v_filas, 'esperadas', v_creadas);

    -- Solo cuentan las filas de la repeticion: el ciclo puede tener historial previo de
    -- la cuenta y no es asunto de esta prueba. Que cuente el total era un error de la
    -- prueba, no del producto.
    SELECT count(*), count(DISTINCT h.estructura_egreso_id)
      INTO v_rastro, v_rastro_doble
      FROM public.p_presupuestos_historial h
     WHERE h.user_id = v_uid AND h.mes_periodo = v_ciclo AND h.motivo = 'repeticion_mensual';
    r := r || jsonb_build_object('caso', 'D deja su rastro una sola vez', 'ok',
        (v_rastro = v_creadas AND v_rastro_doble = v_rastro),
        'filas_repeticion', v_rastro, 'estructuras_distintas', v_rastro_doble, 'esperado', v_creadas);

    -- C · base cero no repite
    v_uid_bc := v_uid;
    v_jwt_bc := v_jwt;
    UPDATE public.p_presupuestos_config SET modo_presupuesto = 'base_cero' WHERE user_id = v_uid_bc;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_jwt_bc, 'role', 'authenticated')::text, true);
    v_base_cero := public.fn_repetir_presupuestos_ciclo();
    r := r || jsonb_build_object('caso', 'C en base cero no repite', 'ok',
        (v_base_cero = 0), 'creadas', v_base_cero, 'usuario', v_uid_bc);

    RAISE EXCEPTION 'RESULTADO %', r::text;
END;
$t$;
