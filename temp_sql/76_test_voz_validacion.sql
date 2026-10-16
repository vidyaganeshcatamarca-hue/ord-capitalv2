-- temp_sql/76_test_voz_validacion.sql
-- Verificacion transaccional de T5/S20 (moneda declarada vs activas al aprobar).
--
--   node --env-file=.env.local temp_sql/76_run_test.mjs
--
-- Unico DO con excepcion forzada; el DDL de 76_deploy corre antes (rollback
-- global). Secuencias IDENTITY restauradas con setval antes del RAISE final.

DO $test$
DECLARE
  v_resultados jsonb := '[]'::jsonb;
  v_user_id     bigint;
  v_auth_id     uuid;
  v_ok          boolean;
  v_err         text;
  v_id          bigint;
  v_ars_id      bigint;
  v_eur_id      bigint;
  v_pendiente   bigint;
  v_estado_after text;
  v_seq_c_last  bigint;
  v_seq_c_called boolean;
  v_seq_p_last  bigint;
  v_seq_p_called boolean;
BEGIN
  SELECT u.user_id, u.auth_id INTO v_user_id, v_auth_id
  FROM public.usuarios u WHERE u.auth_id IS NOT NULL ORDER BY u.user_id LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=FAIL|fallos=1|[{"assertion":"setup","ok":false,"error":"no hay usuarios con auth_id"}]';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_auth_id::text, true);

  SELECT last_value, is_called INTO v_seq_c_last, v_seq_c_called FROM public.p_caja_p_caja_id_seq;
  SELECT last_value, is_called INTO v_seq_p_last, v_seq_p_called FROM public.p_caja_cuarentena_pendiente_id_seq;

  PERFORM public.fn_configurar_region_usuario('AR', 'ARS', 'es', 'manual');
  UPDATE public.p_billeteras SET activa = false WHERE user_id = v_user_id AND moneda = 'EUR' AND activa = true;
  PERFORM public.fn_configurar_monedas_extra(ARRAY['USD', 'EUR']);

  SELECT b.billetera_id INTO v_ars_id FROM public.p_billeteras b
    WHERE b.user_id = v_user_id AND b.moneda = 'ARS' AND b.activa = true
    ORDER BY b.billetera_id LIMIT 1;
  v_eur_id := public.fn_crear_billetera('probe eur t76', 'EUR', 0, '💳', CURRENT_DATE);
  UPDATE public.p_billeteras SET saldo_actual = 1000 WHERE billetera_id = v_ars_id;

  -- ------------------------------------------------------------------ 1. moneda declarada ACTIVA pero distinta de la pata: tolerada
  BEGIN
    INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle, billetera_id, moneda, metadata)
    VALUES (v_user_id, 'voz', 'expense', 'pendiente', 5, CURRENT_DATE, NULL, v_ars_id, 'EUR', jsonb_build_object()::jsonb)
    RETURNING pendiente_id INTO v_pendiente;
    v_id := public.fn_aprobar_cuarentena_v2(v_pendiente);
    v_ok := (v_id IS NOT NULL);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'no aprobo la fila' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','1. S20: moneda declarada EUR (extra activa) en billetera ARS: TOLERADA (la pata manda)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 2. moneda declarada NO activa (GBP): error editable
  BEGIN
    INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle, billetera_id, moneda, metadata)
    VALUES (v_user_id, 'voz', 'expense', 'pendiente', 7, CURRENT_DATE, NULL, v_ars_id, 'GBP', jsonb_build_object()::jsonb)
    RETURNING pendiente_id INTO v_pendiente;
    BEGIN
      v_id := public.fn_aprobar_cuarentena_v2(v_pendiente);
      v_ok := false; v_err := 'aprobo con GBP no activa';
    EXCEPTION WHEN OTHERS THEN
      v_ok := (SQLERRM LIKE '%error_cuarentena_moneda_no_activa%' AND SQLERRM LIKE '%"moneda": "GBP"%');
      v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
    END;
    SELECT estado INTO v_estado_after FROM public.p_caja_cuarentena WHERE pendiente_id = v_pendiente;
    v_ok := v_ok AND (v_estado_after = 'pendiente');
    v_err := CASE WHEN v_ok THEN NULL ELSE COALESCE(v_err,'') || ' estado=' || COALESCE(v_estado_after,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','2. S20: moneda GBP (no activa) -> error_cuarentena_moneda_no_activa + fila sigue pendiente (nunca se pierde)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 3. transfer con moneda declarada GBP: el gate cubre otro tipo
  BEGIN
    INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle, billetera_id, billetera_destino_id, moneda, destination_amount, metadata)
    VALUES (v_user_id, 'voz', 'transfer', 'pendiente', 3, CURRENT_DATE, NULL, v_ars_id, v_eur_id, 'GBP', 2.8, jsonb_build_object()::jsonb)
    RETURNING pendiente_id INTO v_pendiente;
    BEGIN
      v_id := public.fn_aprobar_cuarentena_v2(v_pendiente);
      v_ok := false; v_err := 'aprobo transfer con GBP no activa';
    EXCEPTION WHEN OTHERS THEN
      v_ok := (SQLERRM LIKE '%error_cuarentena_moneda_no_activa%');
      v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
    END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','3. S20: transfer con moneda GBP (no activa) -> error_cuarentena_moneda_no_activa (el gate cubre transfer tambien)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 4. moneda NULL (historicos sin moneda): sin bloqueo
  BEGIN
    INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle, billetera_id, billetera_destino_id, moneda, metadata)
    VALUES (v_user_id, 'voz', 'income', 'pendiente', 9, CURRENT_DATE, NULL, NULL, v_ars_id, NULL, jsonb_build_object()::jsonb)
    RETURNING pendiente_id INTO v_pendiente;
    v_id := public.fn_aprobar_cuarentena_v2(v_pendiente);
    v_ok := (v_id IS NOT NULL);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'no aprobo la fila sin moneda declarada' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','4. S20: sin moneda declarada (NULL) -> aprobacion normal (historicos no bloqueados)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 5. transfer con moneda declarada activa: cubierta por el mismo gate
  BEGIN
    INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, estado, monto, fecha, detalle, billetera_id, billetera_destino_id, moneda, destination_amount, metadata)
    VALUES (v_user_id, 'voz', 'transfer', 'pendiente', 6, CURRENT_DATE, NULL, v_ars_id, v_eur_id, 'EUR', 5.4, jsonb_build_object()::jsonb)
    RETURNING pendiente_id INTO v_pendiente;
    v_id := public.fn_aprobar_cuarentena_v2(v_pendiente);
    v_ok := (v_id IS NOT NULL);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'no aprobo la transfer con moneda activa' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','5. S20: transfer ARS->EUR con moneda declarada EUR: el mismo gate la cubre (aprobada)','ok',v_ok,'error',v_err);

  PERFORM setval('public.p_caja_p_caja_id_seq'::regclass, v_seq_c_last, v_seq_c_called);
  PERFORM setval('public.p_caja_cuarentena_pendiente_id_seq'::regclass, v_seq_p_last, v_seq_p_called);

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