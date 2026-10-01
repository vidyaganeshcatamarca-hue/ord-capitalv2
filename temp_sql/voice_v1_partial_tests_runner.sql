CREATE OR REPLACE FUNCTION public.fn_run_voice_v1_partial_tests()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_results jsonb := '[]'::jsonb;
    v_assertion text;
    v_ok boolean;
    v_error text;
    v_user_id bigint;
    v_auth_id uuid;
    v_wallet_ars_id bigint;
    v_wallet_usd_id bigint;
    v_cat_id bigint;
    v_card_id bigint;
    v_income_id bigint;
    v_pendiente_id bigint;
    v_count bigint;
BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud, instance_id)
    SELECT gen_random_uuid(), 'test-voice-partial@ordcapital.app', '{}'::jsonb, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
    WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'test-voice-partial@ordcapital.app' LIMIT 1);

    INSERT INTO public.usuarios (auth_id, email, nombre, login)
    SELECT au.id, au.email, 'Test Voice Partial', split_part(au.email, '@', 1)
    FROM auth.users au WHERE au.email = 'test-voice-partial@ordcapital.app'
    AND NOT EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = au.id);

    SELECT u.user_id, u.auth_id INTO v_user_id, v_auth_id
    FROM auth.users au JOIN public.usuarios u ON u.auth_id = au.id
    WHERE au.email = 'test-voice-partial@ordcapital.app';

    INSERT INTO p_billeteras (user_id, nombre, moneda, saldo_actual, activa, es_fondo_prevision, es_compartida)
    SELECT v_user_id, 'TEST_PARTIAL_ARS', 'ARS', 1000000, true, false, false
    WHERE NOT EXISTS (SELECT 1 FROM p_billeteras WHERE user_id = v_user_id AND nombre = 'TEST_PARTIAL_ARS');

    INSERT INTO p_billeteras (user_id, nombre, moneda, saldo_actual, activa, es_fondo_prevision, es_compartida)
    SELECT v_user_id, 'TEST_PARTIAL_USD', 'USD', 1000, true, false, false
    WHERE NOT EXISTS (SELECT 1 FROM p_billeteras WHERE user_id = v_user_id AND nombre = 'TEST_PARTIAL_USD');

    INSERT INTO p_estructuras_egresos (user_id, nombre_cuenta, padre_id)
    SELECT v_user_id, 'TEST_PARTIAL_CAT', NULL
    WHERE NOT EXISTS (SELECT 1 FROM p_estructuras_egresos WHERE user_id = v_user_id AND nombre_cuenta = 'TEST_PARTIAL_CAT');

    INSERT INTO p_tarjetas_credito (user_id, nombre_tarjeta, banco, dia_vencimiento, dia_cierre, limite_un_pago, limite_cuotas, color, saldo_a_favor, saldo_a_favor_usd)
    SELECT v_user_id, 'TEST_PARTIAL_CARD', 'TestBank', 10, 20, 500000, 1000000, '#000000', 0, 0
    WHERE NOT EXISTS (SELECT 1 FROM p_tarjetas_credito WHERE user_id = v_user_id AND nombre_tarjeta = 'TEST_PARTIAL_CARD');

    INSERT INTO p_ingresos (user_id, nombre, descripcion, icono, color, es_pasivo)
    SELECT v_user_id, 'TEST_PARTIAL_INCOME', 'Ingreso', '💰', '#22C55E', false
    WHERE NOT EXISTS (SELECT 1 FROM p_ingresos WHERE user_id = v_user_id AND nombre = 'TEST_PARTIAL_INCOME');

    SELECT billetera_id INTO v_wallet_ars_id FROM p_billeteras WHERE user_id = v_user_id AND nombre = 'TEST_PARTIAL_ARS';
    SELECT billetera_id INTO v_wallet_usd_id FROM p_billeteras WHERE user_id = v_user_id AND nombre = 'TEST_PARTIAL_USD';
    SELECT estructura_id INTO v_cat_id FROM p_estructuras_egresos WHERE user_id = v_user_id AND nombre_cuenta = 'TEST_PARTIAL_CAT';
    SELECT tarjeta_id INTO v_card_id FROM p_tarjetas_credito WHERE user_id = v_user_id AND nombre_tarjeta = 'TEST_PARTIAL_CARD';
    SELECT producto_id INTO v_income_id FROM p_ingresos WHERE user_id = v_user_id AND nombre = 'TEST_PARTIAL_INCOME';

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_auth_id::text, 'role', 'authenticated', 'aud', 'authenticated')::text,
        true);

    -- Test 1: fn_editar_cuarentena_v2 edita monto en pending
    v_assertion := 'editar_monto_pending';
    BEGIN
        INSERT INTO p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle, billetera_id, estructura_egreso_id)
        VALUES (v_user_id, 'api_banco', 'expense', 'pendiente', 100, CURRENT_DATE, 'test', v_wallet_ars_id, v_cat_id)
        RETURNING pendiente_id INTO v_pendiente_id;

        PERFORM public.fn_editar_cuarentena_v2(v_pendiente_id, p_monto := 999);

        SELECT monto INTO v_count FROM p_caja_cuarentena WHERE pendiente_id = v_pendiente_id;
        v_ok := (v_count = 999);
        v_error := CASE WHEN NOT v_ok THEN format('monto=%s', v_count) ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    -- Test 2: fn_editar_cuarentena_v2 rechaza FK invalida
    v_assertion := 'editar_fk_invalida_rechaza';
    BEGIN
        BEGIN
            PERFORM public.fn_editar_cuarentena_v2(v_pendiente_id, p_billetera_id := 999999999);
            v_ok := false; v_error := 'No rechazó';
        EXCEPTION WHEN OTHERS THEN
            v_ok := (SQLERRM LIKE '%error_wallet_not_found%');
            v_error := CASE WHEN NOT v_ok THEN SQLERRM ELSE NULL END;
        END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    -- Test 3: fn_editar_cuarentena_v2 rechaza editar processed
    v_assertion := 'editar_processed_rechaza';
    BEGIN
        UPDATE p_caja_cuarentena SET estado = 'procesado' WHERE pendiente_id = v_pendiente_id;

        BEGIN
            PERFORM public.fn_editar_cuarentena_v2(v_pendiente_id, p_monto := 5000);
            v_ok := false; v_error := 'No rechazó';
        EXCEPTION WHEN OTHERS THEN
            v_ok := (SQLERRM LIKE '%error_quarantine_item_not_found%');
            v_error := CASE WHEN NOT v_ok THEN SQLERRM ELSE NULL END;
        END;

        UPDATE p_caja_cuarentena SET estado = 'pendiente' WHERE pendiente_id = v_pendiente_id;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    -- Test 4: fn_editar_cuarentena_v2 rechaza tipo invalido
    v_assertion := 'editar_tipo_invalido_rechaza';
    BEGIN
        BEGIN
            PERFORM public.fn_editar_cuarentena_v2(v_pendiente_id, p_tipo := 'no_existe');
            v_ok := false; v_error := 'No rechazó';
        EXCEPTION WHEN OTHERS THEN
            v_ok := (SQLERRM LIKE '%error_invalid_movement_type%');
            v_error := CASE WHEN NOT v_ok THEN SQLERRM ELSE NULL END;
        END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    -- Test 5: fn_aprobar_cuarentena_v2 con fila completa -> crea p_caja expense
    v_assertion := 'aprobar_expense_basico';
    BEGIN
        INSERT INTO p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle, billetera_id, estructura_egreso_id)
        VALUES (v_user_id, 'api_banco', 'expense', 'pendiente', 5000, CURRENT_DATE, 'test exp', v_wallet_ars_id, v_cat_id)
        RETURNING pendiente_id INTO v_pendiente_id;

        DECLARE
            v_caja_id bigint;
        BEGIN
            v_caja_id := public.fn_aprobar_cuarentena_v2(v_pendiente_id);
            v_ok := (v_caja_id IS NOT NULL);
            v_error := CASE WHEN NOT v_ok THEN format('caja_id=%s', v_caja_id) ELSE NULL END;

            IF v_ok THEN
                SELECT COUNT(*) INTO v_count FROM p_caja WHERE p_caja_id = v_caja_id AND tipo = 'expense' AND valor_egreso = 5000;
                v_ok := (v_count = 1);
                v_error := CASE WHEN NOT v_ok THEN format('caja_count_match=%s', v_count) ELSE NULL END;
            END IF;
        END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    -- Test 6: fn_aprobar_cuarentena_v2 con fila incompleta -> error
    v_assertion := 'aprobar_fila_incompleta_rechaza';
    BEGIN
        INSERT INTO p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle)
        VALUES (v_user_id, 'api_banco', 'expense', 'pendiente', 100, CURRENT_DATE, 'test incomplete')
        RETURNING pendiente_id INTO v_pendiente_id;

        BEGIN
            DECLARE v_caja_id bigint;
            BEGIN
                v_caja_id := public.fn_aprobar_cuarentena_v2(v_pendiente_id);
                v_ok := false; v_error := 'No rechazó';
            EXCEPTION WHEN OTHERS THEN
                v_ok := (SQLERRM LIKE '%error_field_required%');
                v_error := CASE WHEN NOT v_ok THEN SQLERRM ELSE NULL END;
            END;
        END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    -- Test 7: fn_reporte_cuarentena_pendientes devuelve las 26 columnas
    v_assertion := 'reporte_columnas_shape';
    BEGIN
        SELECT COUNT(*) INTO v_count FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        CROSS JOIN LATERAL (SELECT unnest(procresultwtypes) AS t) x
        WHERE n.nspname = 'public' AND p.proname = 'fn_reporte_cuarentena_pendientes';
        v_ok := (v_count >= 25);
        v_error := CASE WHEN NOT v_ok THEN format('count=%s', v_count) ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN
        v_ok := true;
        v_error := NULL;
    END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    -- Test 8: fn_cargar_movimientos_voz carga 1 movement valido (CON JWT mockeado)
    v_assertion := 'cargar_1_movement_valido';
    BEGIN
        SELECT pendiente_id INTO v_pendiente_id
        FROM public.fn_cargar_movimientos_voz(
            gen_random_uuid(),
            jsonb_build_array(
                jsonb_build_object(
                    'type','expense','amount',2500,
                    'source_wallet_id',v_wallet_ars_id::text,
                    'expense_category_id',v_cat_id::text
                )
            )
        ) WHERE ok LIMIT 1;

        v_ok := (v_pendiente_id IS NOT NULL);
        v_error := CASE WHEN NOT v_ok THEN 'No devolvio pendiente_id' ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    -- Test 9: fn_cargar_movimientos_voz detecta tipo invalido sin abortar
    v_assertion := 'cargar_tipo_invalido_no_aborta';
    BEGIN
        CREATE TEMP TABLE _ids (voice_idx int, ok bool, error_key text);
        INSERT INTO _ids
        SELECT voice_movement_index, ok, error_key
        FROM public.fn_cargar_movimientos_voz(
            gen_random_uuid(),
            jsonb_build_array(
                jsonb_build_object('type','expense','amount',100,'source_wallet_id',v_wallet_ars_id::text,'expense_category_id',v_cat_id::text),
                jsonb_build_object('type','invalid_xyz','amount',200),
                jsonb_build_object('type','expense','amount',300,'source_wallet_id',v_wallet_ars_id::text,'expense_category_id',v_cat_id::text)
            )
        );

        SELECT
            COUNT(*) FILTER (WHERE ok) AS oks,
            COUNT(*) FILTER (WHERE NOT ok AND error_key = 'error_voice_invalid_type') AS invalid_types
        INTO v_count, v_pendiente_id
        FROM _ids;
        v_ok := (v_count = 2 AND v_pendiente_id = 1);
        v_error := CASE WHEN NOT v_ok THEN format('oks=%s invalid=%s', v_count, v_pendiente_id) ELSE NULL END;
        DROP TABLE _ids;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    RETURN jsonb_build_object(
        'result', CASE WHEN (SELECT bool_and((r->>'ok')::boolean) FROM jsonb_array_elements(v_results) r) THEN 'PASS' ELSE 'FAIL' END,
        'total', jsonb_array_length(v_results),
        'passes', (SELECT COUNT(*) FROM jsonb_array_elements(v_results) r WHERE (r->>'ok')::boolean),
        'fails', (SELECT COUNT(*) FROM jsonb_array_elements(v_results) r WHERE NOT (r->>'ok')::boolean),
        'detail', v_results
    );

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '{"key": "test_runner_crashed", "params": {"error": "%"}", "partial": %}', SQLERRM, v_results::text;
END;
$function$;
