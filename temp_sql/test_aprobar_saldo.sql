DO $test$
DECLARE
  v_user_id bigint;
  v_wallet_id bigint;
  v_p1 bigint; v_p2 bigint; v_p3 bigint; v_p4 bigint;
  v_saldo numeric;
  v_estado text;
  v_n bigint;
  v_ok int := 0;
  v_total int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"b90d1f17-f691-491a-a840-522510e67640"}', false);
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TEST_SETUP_FAIL: usuario no encontrado'; END IF;

  INSERT INTO public.p_billeteras (user_id, nombre, moneda, saldo_actual, activa, saldo_inicial_pendiente)
  VALUES (v_user_id, '__TEST_SALDO__', 'ARS', 100, true, false)
  RETURNING billetera_id INTO v_wallet_id;

  INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, billetera_id, detalle)
  VALUES (v_user_id, 'ocr', 'expense', 30000, 'ARS', CURRENT_DATE, 'pendiente', v_wallet_id, '__TEST_A_insuf')
  RETURNING pendiente_id INTO v_p1;

  INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, billetera_id, detalle)
  VALUES (v_user_id, 'ocr', 'expense', 50, 'ARS', CURRENT_DATE, 'pendiente', v_wallet_id, '__TEST_B_ok')
  RETURNING pendiente_id INTO v_p2;

  INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, billetera_id, detalle)
  VALUES (v_user_id, 'ocr', 'expense', 30000, 'ARS', CURRENT_DATE, 'pendiente', v_wallet_id, '__TEST_C_lote_insuf')
  RETURNING pendiente_id INTO v_p3;

  INSERT INTO public.p_caja_cuarentena (user_id, origen, tipo, monto, moneda, fecha, estado, billetera_id, detalle)
  VALUES (v_user_id, 'ocr', 'expense', 10, 'ARS', CURRENT_DATE, 'pendiente', v_wallet_id, '__TEST_D_lote_ok')
  RETURNING pendiente_id INTO v_p4;

  -- TEST A: single con saldo insuficiente -> excepcion con la key correcta
  v_total := v_total + 1;
  BEGIN
    PERFORM public.fn_aprobar_cuarentena(v_p1);
    RAISE EXCEPTION 'TEST_FAIL A: aprobo sin saldo suficiente';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%error_wallet_saldo_insuficiente%' THEN v_ok := v_ok + 1;
    ELSE RAISE EXCEPTION 'TEST_FAIL A: error inesperado: %', SQLERRM; END IF;
  END;

  v_total := v_total + 1;
  SELECT estado INTO v_estado FROM public.p_caja_cuarentena WHERE pendiente_id = v_p1;
  IF v_estado = 'pendiente' THEN v_ok := v_ok + 1;
  ELSE RAISE EXCEPTION 'TEST_FAIL A2: estado %, esperaba pendiente', v_estado; END IF;

  -- TEST B: single con saldo suficiente -> procesa y el trigger ajusta saldo
  v_total := v_total + 1;
  PERFORM public.fn_aprobar_cuarentena(v_p2);
  SELECT saldo_actual INTO v_saldo FROM public.p_billeteras WHERE billetera_id = v_wallet_id;
  IF v_saldo = 50 THEN v_ok := v_ok + 1;
  ELSE RAISE EXCEPTION 'TEST_FAIL B: saldo %, esperaba 50', v_saldo; END IF;

  v_total := v_total + 1;
  SELECT estado INTO v_estado FROM public.p_caja_cuarentena WHERE pendiente_id = v_p2;
  IF v_estado = 'procesado' THEN v_ok := v_ok + 1;
  ELSE RAISE EXCEPTION 'TEST_FAIL B2: estado %, esperaba processed', v_estado; END IF;

  -- TEST C: lote con un item insuficiente -> falla atomica, nada procesa
  v_total := v_total + 1;
  BEGIN
    PERFORM public.fn_aprobar_gastos_cuarentena_lote(ARRAY[v_p3, v_p4]);
    RAISE EXCEPTION 'TEST_FAIL C: el lote aprobo sin saldo suficiente';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%error_wallet_saldo_insuficiente%' THEN v_ok := v_ok + 1;
    ELSE RAISE EXCEPTION 'TEST_FAIL C: error inesperado: %', SQLERRM; END IF;
  END;

  v_total := v_total + 1;
  SELECT count(*) INTO v_n FROM public.p_caja_cuarentena WHERE pendiente_id IN (v_p3, v_p4) AND estado = 'pendiente';
  IF v_n = 2 THEN v_ok := v_ok + 1;
  ELSE RAISE EXCEPTION 'TEST_FAIL C2: pendientes %, esperaba 2', v_n; END IF;

  RAISE EXCEPTION 'TEST_RESULT: PASS %/%', v_ok, v_total;
END
$test$;
