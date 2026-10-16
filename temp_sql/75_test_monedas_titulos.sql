-- temp_sql/75_test_monedas_titulos.sql
-- Verificacion transaccional de T3/S17 (titulos dinamicos de transferencia).
--
-- NO crea RPCs de testing ni deja datos: el bloque DO termina con excepcion
-- forzada y Postgres revierte TODO (incluido el DDL de 75_deploy que corre
-- antes, via 75_run_test.mjs). Las secuencias IDENTITY se restauran con setval
-- antes del RAISE final (nextval/setval no son transaccionales).
--
-- Uso: node --env-file=.env.local temp_sql/75_run_test.mjs

DO $test$
DECLARE
  v_resultados jsonb := '[]'::jsonb;
  v_user_id     bigint;
  v_auth_id     uuid;
  v_ok          boolean;
  v_err         text;
  v_txt         text;
  v_json        jsonb;
  v_id          bigint;
  v_ars_id      bigint;
  v_eur_id      bigint;
  v_pendiente   bigint;
  v_monto       numeric;
  v_seq_b_last  bigint;
  v_seq_b_called boolean;
  v_seq_c_last  bigint;
  v_seq_c_called boolean;
  v_seq_p_last  bigint;
  v_seq_p_called boolean;
BEGIN
  -- ------------------------------------------------------------------ setup
  SELECT u.user_id, u.auth_id INTO v_user_id, v_auth_id
  FROM public.usuarios u WHERE u.auth_id IS NOT NULL ORDER BY u.user_id LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=FAIL|fallos=1|[{"assertion":"setup","ok":false,"error":"no hay usuarios con auth_id"}]';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_auth_id::text, true);

  -- Secuencias IDENTITY que este test quema (no transaccionales).
  SELECT last_value, is_called INTO v_seq_b_last, v_seq_b_called FROM public.p_billeteras_billetera_id_seq;
  SELECT last_value, is_called INTO v_seq_c_last, v_seq_c_called FROM public.p_caja_p_caja_id_seq;
  SELECT last_value, is_called INTO v_seq_p_last, v_seq_p_called FROM public.p_caja_cuarentena_pendiente_id_seq;

  -- Región determinista AR/ARS + extras [USD, EUR] para tener billeteras EUR.
  PERFORM public.fn_configurar_region_usuario('AR', 'ARS', 'es', 'manual');
  UPDATE public.p_billeteras SET activa = false WHERE user_id = v_user_id AND moneda = 'EUR' AND activa = true;
  PERFORM public.fn_configurar_monedas_extra(ARRAY['USD', 'EUR']);

  -- ------------------------------------------------------------------ 1-8. helper (unidad)
  BEGIN
    v_ok := public.fn_titulo_transferencia('ARS', 'USD', 'ARS') = 'transfer_compra_dolares'
        AND public.fn_titulo_transferencia('GBP', 'USD', 'ARS') = 'transfer_compra_dolares'
        AND public.fn_titulo_transferencia('USD', 'ARS', 'ARS') = 'transfer_venta_dolares'
        AND public.fn_titulo_transferencia('ARS', 'ARS', 'ARS') = 'transfer_entre_cuentas'
        AND public.fn_titulo_transferencia('ARS', 'EUR', null) = 'transfer_entre_cuentas'
        AND (public.fn_titulo_transferencia('ARS', 'EUR', 'ARS')::jsonb ->> 'key') = 'transfer_compra_moneda'
        AND (public.fn_titulo_transferencia('ARS', 'EUR', 'ARS')::jsonb -> 'params' ->> 'moneda') = 'EUR'
        AND (public.fn_titulo_transferencia('EUR', 'ARS', 'ARS')::jsonb ->> 'key') = 'transfer_venta_moneda'
        AND (public.fn_titulo_transferencia('USD', 'GBP', 'ARS')::jsonb ->> 'key') = 'transfer_compra_moneda'
        AND (public.fn_titulo_transferencia('USD', 'GBP', 'ARS')::jsonb -> 'params' ->> 'moneda') = 'GBP';
    v_err := CASE WHEN v_ok THEN NULL ELSE 'devolvio: compra1=' || COALESCE(public.fn_titulo_transferencia('ARS','USD','ARS'),'NULL')
      || ' gbp-usd=' || COALESCE(public.fn_titulo_transferencia('GBP','USD','ARS'),'NULL')
      || ' venta=' || COALESCE(public.fn_titulo_transferencia('USD','ARS','ARS'),'NULL')
      || ' misma=' || COALESCE(public.fn_titulo_transferencia('ARS','ARS','ARS'),'NULL')
      || ' sinlocal=' || COALESCE(public.fn_titulo_transferencia('ARS','EUR',null),'NULL')
      || ' jsonCompra=' || COALESCE(public.fn_titulo_transferencia('ARS','EUR','ARS'),'NULL')
      || ' jsonVenta=' || COALESCE(public.fn_titulo_transferencia('EUR','ARS','ARS'),'NULL')
      || ' jsonUsdGbp=' || COALESCE(public.fn_titulo_transferencia('USD','GBP','ARS'),'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','1. Helper fn_titulo_transferencia: 10 reglas (legacy USD compra/venta, entre_cuentas, JSON compra/venta con CODE, destino-based naming)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 2. billeteras del test
  BEGIN
    SELECT b.billetera_id INTO v_ars_id FROM public.p_billeteras b
      WHERE b.user_id = v_user_id AND b.moneda = 'ARS' AND b.activa = true
      ORDER BY b.billetera_id LIMIT 1;
    IF v_ars_id IS NULL THEN
      v_ars_id := public.fn_crear_billetera('probe ars s17', 'ARS', 0, '💳', CURRENT_DATE);
    END IF;
    UPDATE public.p_billeteras SET saldo_actual = 1000 WHERE billetera_id = v_ars_id;
    v_eur_id := public.fn_crear_billetera('probe eur s17', 'EUR', 0, '💳', CURRENT_DATE);
    UPDATE public.p_billeteras SET saldo_actual = 0 WHERE billetera_id = v_eur_id;
    v_ok := (v_ars_id IS NOT NULL AND v_eur_id IS NOT NULL);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'ARS=' || COALESCE(v_ars_id::text,'NULL') || ' EUR=' || COALESCE(v_eur_id::text,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','2. Billeteras del test: ARS (saldo 1000) + EUR creada con EUR entre las extras','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 3. registrar ARS->EUR: JSON compra de EUR en ambas patas
  BEGIN
    PERFORM public.fn_registrar_movimiento_caja(
      'transfer', v_ars_id, v_eur_id, 0, 100, 'probe s17 compra eur', CURRENT_DATE,
      false, NULL, NULL, NULL, 'nota usuario s17', 89.26);
    SELECT jsonb_agg(DISTINCT detalle) INTO v_json
      FROM public.p_caja
      WHERE user_id = v_user_id AND tipo IN ('expense','income')
        AND metadata @> '{"transfer_double_insert": true}'
        AND fecha = CURRENT_DATE
        AND (detalle LIKE '%s17%' OR detalle IS NULL OR detalle LIKE '{"key"%' OR detalle IN ('transfer_compra_dolares','transfer_venta_dolares','transfer_entre_cuentas'));
    v_txt := (SELECT (detalle::jsonb ->> 'key') FROM public.p_caja WHERE user_id = v_user_id AND metadata @> '{"transfer_double_insert": true}' AND fecha = CURRENT_DATE AND detalle LIKE '{"key"%' ORDER BY p_caja_id DESC LIMIT 1);
    -- La nota del usuario vive en metadata.nota (se preserva con el titulo dinamico).
    SELECT count(*) INTO v_id FROM public.p_caja
      WHERE user_id = v_user_id AND metadata @> '{"transfer_double_insert": true}' AND fecha = CURRENT_DATE
        AND metadata->>'nota' = 'nota usuario s17';
    v_ok := (v_txt = 'transfer_compra_moneda' AND v_id = 2);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'key=' || COALESCE(v_txt,'NULL') || ' patas_con_nota=' || COALESCE(v_id::text,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','3. registrar ARS->EUR: ambas patas con transfer_compra_moneda (JSON) + nota preservada','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 4. registrar USD->ARS: venta_dolares legada
  BEGIN
    SELECT b.billetera_id INTO v_id FROM public.p_billeteras b
      WHERE b.user_id = v_user_id AND b.moneda = 'USD' AND b.activa = true
      ORDER BY b.billetera_id LIMIT 1;
    IF v_id IS NULL THEN
      v_id := public.fn_crear_billetera('probe usd s17', 'USD', 0, '💳', CURRENT_DATE);
      UPDATE public.p_billeteras SET saldo_actual = 1000 WHERE billetera_id = v_id;
    END IF;
    PERFORM public.fn_registrar_movimiento_caja(
      'transfer', v_id, v_ars_id, 0, 10, 'probe s17 venta usd', CURRENT_DATE,
      false, NULL, NULL, NULL, NULL, 1515.88);
    SELECT detalle INTO v_txt FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'expense'
      AND metadata @> '{"transfer_double_insert": true}' AND fecha = CURRENT_DATE ORDER BY p_caja_id DESC LIMIT 1;
    v_ok := (v_txt = 'transfer_venta_dolares');
    v_err := CASE WHEN v_ok THEN NULL ELSE 'detalle=' || COALESCE(v_txt,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','4. registrar USD->ARS: transfer_venta_dolares (key legacy intacta)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 5. aprobar cuarentena ARS->EUR: JSON compra de EUR
  BEGIN
    INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle, billetera_id, billetera_destino_id, moneda, destination_amount, metadata)
    VALUES (v_user_id, 'voz', 'transfer', 'pendiente', 50, CURRENT_DATE, NULL, v_ars_id, v_eur_id, 'ARS', 44.5, jsonb_build_object()::jsonb)
    RETURNING pendiente_id INTO v_pendiente;
    v_id := public.fn_aprobar_cuarentena_v2(v_pendiente);
    SELECT detalle INTO v_txt FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'expense' AND billetera_origen_id = v_ars_id ORDER BY p_caja_id DESC LIMIT 1;
    v_ok := (v_id IS NOT NULL AND (v_txt::jsonb ->> 'key') = 'transfer_compra_moneda' AND (v_txt::jsonb -> 'params' ->> 'moneda') = 'EUR');
    v_err := CASE WHEN v_ok THEN NULL ELSE 'detalle=' || COALESCE(v_txt,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','5. aprobar ARS->EUR: patas con transfer_compra_moneda JSON (el aprobador nunca resolvia local)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 6. aprobar cuarentena USD->ARS: venta_dolares legada
  BEGIN
    SELECT b.billetera_id INTO v_id FROM public.p_billeteras b
      WHERE b.user_id = v_user_id AND b.moneda = 'USD' AND b.activa = true
      ORDER BY b.billetera_id LIMIT 1;
    UPDATE public.p_billeteras SET saldo_actual = 1000 WHERE billetera_id = v_id;
    INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle, billetera_id, billetera_destino_id, moneda, destination_amount, metadata)
    VALUES (v_user_id, 'voz', 'transfer', 'pendiente', 5, CURRENT_DATE, NULL, v_id, v_ars_id, 'USD', 7579.38, jsonb_build_object()::jsonb)
    RETURNING pendiente_id INTO v_pendiente;
    v_id := public.fn_aprobar_cuarentena_v2(v_pendiente);
    SELECT detalle INTO v_txt FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'expense' AND fecha = CURRENT_DATE ORDER BY p_caja_id DESC LIMIT 1;
    v_ok := (v_id IS NOT NULL AND v_txt = 'transfer_venta_dolares');
    v_err := CASE WHEN v_ok THEN NULL ELSE 'detalle=' || COALESCE(v_txt,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','6. aprobar USD->ARS: venta_dolares (key legacy intacta)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 7. aprobar cuarentena con nota del usuario: la nota gana
  BEGIN
    INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle, billetera_id, billetera_destino_id, moneda, destination_amount, metadata)
    VALUES (v_user_id, 'voz', 'transfer', 'pendiente', 20, CURRENT_DATE, 'vino del super', v_ars_id, v_eur_id, 'ARS', 17.9, jsonb_build_object()::jsonb)
    RETURNING pendiente_id INTO v_pendiente;
    v_id := public.fn_aprobar_cuarentena_v2(v_pendiente);
    SELECT detalle INTO v_txt FROM public.p_caja WHERE user_id = v_user_id AND tipo = 'expense' ORDER BY p_caja_id DESC LIMIT 1;
    v_ok := (v_id IS NOT NULL AND v_txt = 'vino del super');
    v_err := CASE WHEN v_ok THEN NULL ELSE 'detalle=' || COALESCE(v_txt,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','7. aprobar con nota del usuario: la nota gana sobre el titulo (comportamiento actual intacto)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ restauracion de secuencias
  PERFORM setval('public.p_billeteras_billetera_id_seq'::regclass, v_seq_b_last, v_seq_b_called);
  PERFORM setval('public.p_caja_p_caja_id_seq'::regclass, v_seq_c_last, v_seq_c_called);
  PERFORM setval('public.p_caja_cuarentena_pendiente_id_seq'::regclass, v_seq_p_last, v_seq_p_called);

  -- ------------------------------------------------------------------ reporte
  DECLARE
    v_fallos int;
  BEGIN
    SELECT COUNT(*) INTO v_fallos
    FROM jsonb_array_elements(v_resultados) e
    WHERE (e->>'ok')::boolean IS NOT TRUE;
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=%|fallos=%|%',
      CASE WHEN v_fallos = 0 THEN 'PASS' ELSE 'FAIL' END, v_fallos, v_resultados::text;
  END;
END
$test$;