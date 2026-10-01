CREATE OR REPLACE FUNCTION public.fn_run_voice_v1_tests(p_test_user_email text DEFAULT 'test-voice@ordcapital.app')
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
    v_wallet_ars_id bigint;
    v_wallet_usd_id bigint;
    v_cat_id bigint;
    v_card_id bigint;
    v_income_id bigint;
    v_pendiente_id bigint;
    v_caja_id bigint;
    v_movements jsonb;
    v_carga record;
    v_count bigint;
    v_job_id uuid := gen_random_uuid();
BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud, instance_id)
    SELECT gen_random_uuid(), p_test_user_email, '{}'::jsonb, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
    WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = p_test_user_email LIMIT 1);

    INSERT INTO public.usuarios (auth_id, email, nombre, login)
    SELECT au.id, au.email, 'Test Voice v1', split_part(au.email, '@', 1)
    FROM auth.users au WHERE au.email = p_test_user_email
    AND NOT EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = au.id);

    SELECT u.user_id INTO v_user_id
    FROM auth.users au JOIN public.usuarios u ON u.auth_id = au.id
    WHERE au.email = p_test_user_email;

    -- Simular sesion autenticada para que las RPCs internas no fallen con error_unauthorized
    PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT auth_id::text FROM public.usuarios WHERE user_id = v_user_id))::text, true);

    INSERT INTO p_billeteras (user_id, nombre, moneda, saldo_actual, activa, es_fondo_prevision, es_compartida)
    VALUES (v_user_id, 'TEST_WALLET_ARS', 'ARS', 1000000, true, false, false)
    RETURNING billetera_id INTO v_wallet_ars_id;

    INSERT INTO p_billeteras (user_id, nombre, moneda, saldo_actual, activa, es_fondo_prevision, es_compartida)
    VALUES (v_user_id, 'TEST_WALLET_USD', 'USD', 1000, true, false, false)
    RETURNING billetera_id INTO v_wallet_usd_id;

    INSERT INTO p_estructuras_egresos (user_id, nombre_cuenta, padre_id)
    VALUES (v_user_id, 'TEST_CAT', NULL)
    RETURNING estructura_id INTO v_cat_id;

    INSERT INTO p_tarjetas_credito (user_id, nombre_tarjeta, banco, dia_vencimiento, dia_cierre, limite_un_pago, limite_cuotas, color, saldo_a_favor, saldo_a_favor_usd)
    VALUES (v_user_id, 'TEST_CARD', 'TestBank', 10, 20, 500000, 1000000, '#000000', 0, 0)
    RETURNING tarjeta_id INTO v_card_id;

    INSERT INTO p_ingresos (user_id, nombre, descripcion, icono, color, es_pasivo)
    VALUES (v_user_id, 'TEST_INCOME', 'Ingreso de test', '💰', '#22C55E', false)
    RETURNING producto_id INTO v_income_id;

    v_assertion := 'cargar_3_movimientos_validos';
    BEGIN
        v_movements := jsonb_build_array(
            jsonb_build_object('type','expense','amount',25000,'source_wallet_id',v_wallet_ars_id::text,'expense_category_id',v_cat_id::text),
            jsonb_build_object('type','income','amount',500000,'destination_wallet_id',v_wallet_ars_id::text,'income_source_id',v_income_id::text),
            jsonb_build_object('type','card_expense','amount',9000,'card_id',v_card_id::text,'expense_category_id',v_cat_id::text,'currency','ARS','installments',3)
        );
        SELECT COUNT(*) FILTER (WHERE ok) AS oks, COUNT(*) FILTER (WHERE NOT ok) AS fails
        INTO v_carga FROM public.fn_cargar_movimientos_voz(v_job_id, v_movements);
        v_ok := (v_carga.oks = 3 AND v_carga.fails = 0);
        v_error := CASE WHEN NOT v_ok THEN format('oks=%s fails=%s', v_carga.oks, v_carga.fails) ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_assertion := 'cargar_tipo_invalido_no_aborta';
    BEGIN
        v_movements := jsonb_build_array(
            jsonb_build_object('type','expense','amount',1000,'source_wallet_id',v_wallet_ars_id::text,'expense_category_id',v_cat_id::text),
            jsonb_build_object('type','invalid_xyz','amount',2000),
            jsonb_build_object('type','expense','amount',3000,'source_wallet_id',v_wallet_ars_id::text,'expense_category_id',v_cat_id::text)
        );
        SELECT COUNT(*) FILTER (WHERE ok) AS oks,
               COUNT(*) FILTER (WHERE NOT ok AND error_key = 'error_voice_invalid_type') AS invalid_types
        INTO v_carga FROM public.fn_cargar_movimientos_voz(gen_random_uuid(), v_movements);
        v_ok := (v_carga.oks = 2 AND v_carga.invalid_types = 1);
        v_error := CASE WHEN NOT v_ok THEN format('oks=%s invalid=%s', v_carga.oks, v_carga.invalid_types) ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_assertion := 'cargar_fk_invalida_silenciosa';
    BEGIN
        v_movements := jsonb_build_array(
            jsonb_build_object('type','expense','amount',5000,'source_wallet_id',v_wallet_ars_id::text,'expense_category_id','999999999')
        );
        SELECT COUNT(*) FILTER (WHERE ok) AS oks
        INTO v_carga FROM public.fn_cargar_movimientos_voz(gen_random_uuid(), v_movements);
        v_ok := (v_carga.oks = 1);
        v_error := CASE WHEN NOT v_ok THEN format('oks=%s', v_carga.oks) ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_movements := jsonb_build_array(jsonb_build_object('type','expense','amount',10000,'source_wallet_id',v_wallet_ars_id::text,'expense_category_id',v_cat_id::text,'date','2026-01-01'));
    SELECT pendiente_id INTO v_pendiente_id FROM public.fn_cargar_movimientos_voz(v_job_id, v_movements) WHERE ok LIMIT 1;

    v_assertion := 'aprobar_expense_crea_p_caja';
    BEGIN
        v_caja_id := public.fn_aprobar_cuarentena_v2(v_pendiente_id);
        SELECT tipo, valor_egreso INTO v_carga FROM p_caja WHERE p_caja_id = v_caja_id;
        v_ok := (v_caja_id IS NOT NULL AND v_carga.tipo = 'expense' AND v_carga.valor_egreso = 10000);
        v_error := CASE WHEN NOT v_ok THEN format('caja_id=%s tipo=%s', v_caja_id, v_carga.tipo) ELSE NULL END;
        SELECT COUNT(*) INTO v_count FROM p_caja_cuarentena WHERE pendiente_id = v_pendiente_id AND estado = 'processed';
        v_ok := v_ok AND (v_count = 1);
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_movements := jsonb_build_array(jsonb_build_object('type','income','amount',50000,'destination_wallet_id',v_wallet_ars_id::text,'income_source_id',v_income_id::text));
    SELECT pendiente_id INTO v_pendiente_id FROM public.fn_cargar_movimientos_voz(v_job_id, v_movements) WHERE ok LIMIT 1;

    v_assertion := 'aprobar_income_crea_p_caja';
    BEGIN
        v_caja_id := public.fn_aprobar_cuarentena_v2(v_pendiente_id);
        SELECT tipo, valor_ingreso INTO v_carga FROM p_caja WHERE p_caja_id = v_caja_id;
        v_ok := (v_caja_id IS NOT NULL AND v_carga.tipo = 'income' AND v_carga.valor_ingreso = 50000);
        v_error := CASE WHEN NOT v_ok THEN format('caja_id=%s tipo=%s', v_caja_id, v_carga.tipo) ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_movements := jsonb_build_array(jsonb_build_object('type','transfer','amount',3000,'source_wallet_id',v_wallet_ars_id::text,'destination_wallet_id',v_wallet_ars_id::text));
    SELECT pendiente_id INTO v_pendiente_id FROM public.fn_cargar_movimientos_voz(v_job_id, v_movements) WHERE ok LIMIT 1;

    v_assertion := 'aprobar_transfer_same_currency_una_fila';
    BEGIN
        v_caja_id := public.fn_aprobar_cuarentena_v2(v_pendiente_id);
        SELECT tipo, valor_egreso, valor_ingreso INTO v_carga FROM p_caja WHERE p_caja_id = v_caja_id;
        v_ok := (v_caja_id IS NOT NULL AND v_carga.tipo = 'transfer' AND v_carga.valor_egreso = 3000 AND v_carga.valor_ingreso = 3000);
        v_error := CASE WHEN NOT v_ok THEN format('caja_id=%s tipo=%s', v_caja_id, v_carga.tipo) ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_movements := jsonb_build_array(jsonb_build_object('type','transfer','amount',5000,'source_wallet_id',v_wallet_ars_id::text,'destination_wallet_id',v_wallet_usd_id::text,'destination_amount',4));
    SELECT pendiente_id INTO v_pendiente_id FROM public.fn_cargar_movimientos_voz(v_job_id, v_movements) WHERE ok LIMIT 1;

    v_assertion := 'aprobar_transfer_cross_currency_doble_insercion';
    BEGIN
        v_caja_id := public.fn_aprobar_cuarentena_v2(v_pendiente_id);
        SELECT COUNT(*) INTO v_count FROM p_caja
        WHERE (billetera_origen_id = v_wallet_ars_id OR billetera_origen_id = v_wallet_usd_id)
          AND metadata->>'transfer_double_insert' = 'true'
          AND user_id = v_user_id;
        v_ok := (v_count = 2);
        v_error := CASE WHEN NOT v_ok THEN format('count=%s', v_count) ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_movements := jsonb_build_array(jsonb_build_object('type','card_expense','amount',7000,'card_id',v_card_id::text,'expense_category_id',v_cat_id::text,'currency','USD','installments',6));
    SELECT pendiente_id INTO v_pendiente_id FROM public.fn_cargar_movimientos_voz(v_job_id, v_movements) WHERE ok LIMIT 1;

    v_assertion := 'aprobar_card_expense';
    BEGIN
        v_caja_id := public.fn_aprobar_cuarentena_v2(v_pendiente_id);
        SELECT tarjeta_id, valor_egreso, cuotas_totales, es_usd INTO v_carga FROM p_caja WHERE p_caja_id = v_caja_id;
        v_ok := (v_caja_id IS NOT NULL AND v_carga.tarjeta_id = v_card_id AND v_carga.valor_egreso = 7000 AND v_carga.cuotas_totales = 6 AND v_carga.es_usd = true);
        v_error := CASE WHEN NOT v_ok THEN format('caja_id=%s tarjeta=%s', v_caja_id, v_carga.tarjeta_id) ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_assertion := 'reprocesar_item_processed_error';
    BEGIN
        BEGIN
            v_caja_id := public.fn_aprobar_cuarentena_v2(v_pendiente_id);
            v_ok := false; v_error := 'No lanzó error';
        EXCEPTION WHEN OTHERS THEN
            v_ok := (SQLERRM LIKE '%error_quarantine_item_not_found%');
            v_error := CASE WHEN NOT v_ok THEN SQLERRM ELSE NULL END;
        END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_assertion := 'lote_aprueba_y_reporta';
    BEGIN
        v_movements := jsonb_build_array(
            jsonb_build_object('type','expense','amount',100,'source_wallet_id',v_wallet_ars_id::text,'expense_category_id',v_cat_id::text),
            jsonb_build_object('type','expense','amount',200,'source_wallet_id',v_wallet_ars_id::text,'expense_category_id',v_cat_id::text)
        );
        CREATE TEMP TABLE _ids (id bigint);
        INSERT INTO _ids (id) SELECT pendiente_id FROM public.fn_cargar_movimientos_voz(gen_random_uuid(), v_movements) WHERE ok;
        SELECT COUNT(*) FILTER (WHERE ok) AS oks, COUNT(*) FILTER (WHERE NOT ok) AS fails
        INTO v_carga FROM public.fn_aprobar_cuarentena_lote_v2(ARRAY[(SELECT id FROM _ids ORDER BY id LIMIT 1), (SELECT id FROM _ids ORDER BY id DESC LIMIT 1), 999999999]);
        v_ok := (v_carga.oks = 2 AND v_carga.fails = 1);
        v_error := CASE WHEN NOT v_ok THEN format('oks=%s fails=%s', v_carga.oks, v_carga.fails) ELSE NULL END;
        DROP TABLE _ids;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_assertion := 'editar_campo_pending_ok';
    BEGIN
        v_movements := jsonb_build_array(jsonb_build_object('type','expense','amount',500,'source_wallet_id',v_wallet_ars_id::text,'expense_category_id',v_cat_id::text));
        SELECT pendiente_id INTO v_pendiente_id FROM public.fn_cargar_movimientos_voz(gen_random_uuid(), v_movements) WHERE ok LIMIT 1;
        PERFORM public.fn_editar_cuarentena_v2(v_pendiente_id, p_monto := 999, p_detalle := 'editado');
        SELECT monto, detalle INTO v_carga FROM p_caja_cuarentena WHERE pendiente_id = v_pendiente_id;
        v_ok := (v_carga.monto = 999 AND v_carga.detalle = 'editado');
        v_error := CASE WHEN NOT v_ok THEN format('monto=%s detalle=%s', v_carga.monto, v_carga.detalle) ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN v_ok := false; v_error := SQLERRM; END;
    v_results := v_results || jsonb_build_object('assertion', v_assertion, 'ok', v_ok, 'error', v_error);

    v_assertion := 'editar_fk_invalida_error';
    BEGIN
        BEGIN
            PERFORM public.fn_editar_cuarentena_v2(v_pendiente_id, p_billetera_id := 999999999);
            v_ok := false; v_error := 'No lanzó error';
        EXCEPTION WHEN OTHERS THEN
            v_ok := (SQLERRM LIKE '%error_wallet_not_found%');
            v_error := CASE WHEN NOT v_ok THEN SQLERRM ELSE NULL END;
        END;
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
