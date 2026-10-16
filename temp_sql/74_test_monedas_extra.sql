-- temp_sql/74_test_monedas_extra.sql
-- Verificacion transaccional de T1 (monedas extra libres).
--
-- NO crea RPCs de testing ni deja datos: es un unico DO que termina con una
-- excepcion forzada, asi que Postgres revierte toda la transaccion (incluido el
-- DDL de 74_deploy_monedas_extra.sql que el harness corre antes).
--
-- Uso: node --env-file=.env.local temp_sql/74_run_test.mjs

DO $test$
DECLARE
  v_resultados jsonb := '[]'::jsonb;
  v_user_id     bigint;
  v_auth_id     uuid;
  v_ok          boolean;
  v_err         text;
  v_json        jsonb;
  v_cot         numeric;
  v_exp         numeric;
  v_usd         numeric;
  v_fecha       date;
  v_id          bigint;
  v_cnt         int;
  v_seq_b_last  bigint;
  v_seq_b_called boolean;
  v_seq_c_last  bigint;
  v_seq_c_called boolean;
BEGIN
  -- ------------------------------------------------------------------ setup
  SELECT u.user_id, u.auth_id INTO v_user_id, v_auth_id
  FROM public.usuarios u
  WHERE u.auth_id IS NOT NULL
  ORDER BY u.user_id LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=FAIL|fallos=1|[{"assertion":"setup","ok":false,"error":"no hay usuarios con auth_id"}]';
  END IF;

  -- Identidad simulada para que auth.uid() devuelva este usuario.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_auth_id::text, true);

  -- Las secuencias IDENTITY (p_billeteras, p_caja) NO son transaccionales: nextval
  -- las quema aunque la transaccion se revierta. Se capturan ACA (antes de crear
  -- nada) y se restauran con setval justo antes del RAISE final del reporte.
  SELECT last_value, is_called INTO v_seq_b_last, v_seq_b_called
    FROM public.p_billeteras_billetera_id_seq;
  SELECT last_value, is_called INTO v_seq_c_last, v_seq_c_called
    FROM public.p_caja_p_caja_id_seq;

  -- Region deterministicamente AR/ARS (local=ARS) y estado limpio de EUR.
  PERFORM public.fn_configurar_region_usuario('AR', 'ARS', 'es', 'manual');
  UPDATE public.p_billeteras SET activa = false
   WHERE user_id = v_user_id AND moneda = 'EUR' AND activa = true;
  UPDATE public.p_config_region SET monedas_extra = '["USD"]'::jsonb WHERE user_id = v_user_id;

  -- ------------------------------------------------------------------ 1. default del ALTER
  BEGIN
    DELETE FROM public.p_config_region WHERE user_id = v_user_id;
    -- INSERT minimal (solo user_id): monedas_extra tiene que venir del DEFAULT
    -- que instala el ALTER (S8/S13), no de ningun valor escrito por el test.
    -- (p_config_region no tiene FKs entrantes: verificado en vivo 2026-10-16.)
    INSERT INTO public.p_config_region (user_id) VALUES (v_user_id);
    SELECT r.monedas_extra INTO v_json
    FROM public.p_config_region r WHERE r.user_id = v_user_id;
    v_ok := (v_json = '["USD"]'::jsonb);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'monedas_extra = ' || COALESCE(v_json::text, 'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','1. INSERT fresco de p_config_region hereda monedas_extra=["USD"] del DEFAULT del ALTER (S8/S13)','ok',v_ok,'error',v_err);
  -- Restore determinista: la fila fresca queda sin pais/moneda_default, y el
  -- resto del test necesita local=ARS. El UPSERT re-estampa pais/idioma/moneda
  -- sin tocar monedas_extra (queda el ["USD"] del DEFAULT).
  PERFORM public.fn_configurar_region_usuario('AR', 'ARS', 'es', 'manual');

  -- ------------------------------------------------------------------ 2. happy path
  BEGIN
    SELECT public.fn_configurar_monedas_extra(ARRAY['usd', 'eur']) INTO v_json;
    v_ok := (v_json = '["USD","EUR"]'::jsonb);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'devolvio ' || COALESCE(v_json::text, 'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','2. Configurar ["usd","eur"] -> ["USD","EUR"] (normalizado a mayusculas)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 3. no existe en p_divisas
  BEGIN
    PERFORM public.fn_configurar_monedas_extra(ARRAY['ZZZ']);
    v_ok := false; v_err := 'no lanzo excepcion';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_monedas_extra_invalida%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','3. Moneda fuera de p_divisas -> error_monedas_extra_invalida','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 4. moneda local
  BEGIN
    PERFORM public.fn_configurar_monedas_extra(ARRAY['ARS']);
    v_ok := false; v_err := 'no lanzo excepcion';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_monedas_extra_local%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','4. Moneda local (ARS) -> error_monedas_extra_local','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 5. duplicados
  BEGIN
    PERFORM public.fn_configurar_monedas_extra(ARRAY['USD', 'USD']);
    v_ok := false; v_err := 'no lanzo excepcion';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_monedas_extra_duplicada%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','5. Duplicados -> error_monedas_extra_duplicada','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 6. max 2
  BEGIN
    PERFORM public.fn_configurar_monedas_extra(ARRAY['USD', 'EUR', 'GBP']);
    v_ok := false; v_err := 'no lanzo excepcion';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_monedas_extra_limite%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','6. 3 items -> error_monedas_extra_limite','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 16. bypass multidimensional (bloqueador del verificador)
  -- Un text[][] 2x2 con 4 monedas de catalogo atraviesa la misma validacion del
  -- FOREACH: con cardinality() el limite S5 cuenta TODOS los elementos de TODAS
  -- las dimensiones, no solo el array_length de la dimension 1.
  BEGIN
    PERFORM public.fn_configurar_monedas_extra(ARRAY[['USD','EUR'],['GBP','CHF']]);
    v_ok := false; v_err := 'no lanzo excepcion';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_monedas_extra_limite%' AND SQLERRM LIKE '%"count": 4%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','16. Regresion bypass: text[][] 2x2 con 4 monedas -> error_monedas_extra_limite (count=4)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 7. S14 bloqueo con billeteras activas
  BEGIN
    PERFORM public.fn_configurar_monedas_extra(ARRAY['USD', 'EUR']);
    -- Deja la lista actual en ["USD","EUR"] para que EUR sea "extra"
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','7a. Preparar extras ["USD","EUR"]','ok',v_ok,'error',v_err);

  BEGIN
    v_id := public.fn_crear_billetera('probe eur s14', 'EUR', 0, '💳', CURRENT_DATE);
    v_ok := (v_id IS NOT NULL); v_err := CASE WHEN v_ok THEN NULL ELSE 'no devolvio id' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','7b. Crear billetera EUR con EUR entre las extras','ok',v_ok,'error',v_err);

  BEGIN
    PERFORM public.fn_configurar_monedas_extra(ARRAY['USD']);
    v_ok := false; v_err := 'no lanzo excepcion';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_monedas_extra_has_wallets%'
             AND SQLERRM LIKE '%"currency": "EUR"%'
             AND SQLERRM LIKE '%"count": 1%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','7c. S14: quitar EUR con billetera activa -> error_monedas_extra_has_wallets (EUR,1)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 8. quitar sin billeteras activas
  BEGIN
    UPDATE public.p_billeteras SET activa = false
     WHERE user_id = v_user_id AND moneda = 'EUR' AND activa = true;
    SELECT public.fn_configurar_monedas_extra(ARRAY['USD']) INTO v_json;
    v_ok := (v_json = '["USD"]'::jsonb);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'devolvio ' || COALESCE(v_json::text, 'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','8. S14: quitar EUR sin billeteras activas -> OK y persiste ["USD"]','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 9. S10 excluye local
  BEGIN
    UPDATE public.p_config_region SET monedas_extra = '["ARS","USD"]'::jsonb WHERE user_id = v_user_id;
    SELECT public.fn_obtener_monedas_extra() INTO v_json;
    v_ok := (v_json = '["USD"]'::jsonb);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'devolvio ' || COALESCE(v_json::text, 'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','9. S10: fn_obtener_monedas_extra excluye la moneda local (ARS)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 10. coherencia con fn_obtener_cotizacion_usd
  BEGIN
    SELECT c.cotizacion INTO v_cot FROM public.fn_obtener_cotizacion('ARS', 'USD') c;
    SELECT public.fn_obtener_cotizacion_usd() INTO v_usd;
    v_ok := (v_cot IS NOT NULL AND v_usd IS NOT NULL AND abs((v_cot * v_usd) - 1) < 0.000001);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'cot(local,USD)=' || COALESCE(v_cot::text,'NULL') || ' * fn_obtener_cotizacion_usd=' || COALESCE(v_usd::text,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','10. fn_obtener_cotizacion(local,USD) coherente con fn_obtener_cotizacion_usd (reciproca)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 11. cruzada EUR->GBP
  BEGIN
    SELECT c.cotizacion INTO v_cot FROM public.fn_obtener_cotizacion('EUR', 'GBP') c;
    SELECT dg.valor_por_usd / de.valor_por_usd INTO v_exp
    FROM (SELECT valor_por_usd FROM public.p_divisas WHERE nombre = 'GBP' ORDER BY ultima_actualizacion DESC LIMIT 1) dg,
         (SELECT valor_por_usd FROM public.p_divisas WHERE nombre = 'EUR' ORDER BY ultima_actualizacion DESC LIMIT 1) de;
    v_ok := (v_cot IS NOT NULL AND v_exp IS NOT NULL AND abs(v_cot - v_exp) < 0.0000001);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'cot=' || COALESCE(v_cot::text,'NULL') || ' esperado=' || COALESCE(v_exp::text,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','11. Cruzada EUR->GBP = valor_por_usd(GBP)/valor_por_usd(EUR)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 12. moneda ausente -> NULL NULL (D17)
  BEGIN
    SELECT c.cotizacion, c.fecha INTO v_cot, v_fecha FROM public.fn_obtener_cotizacion('ZZZ', 'USD') c;
    v_ok := (v_cot IS NULL AND v_fecha IS NULL);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'cot=' || COALESCE(v_cot::text,'NULL') || ' fecha=' || COALESCE(v_fecha::text,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','12. D17: moneda ausente -> (NULL, NULL), nunca 1.00','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 13. misma moneda -> 1.00
  BEGIN
    SELECT c.cotizacion, c.fecha INTO v_cot, v_fecha FROM public.fn_obtener_cotizacion('USD', 'USD') c;
    v_ok := (v_cot = 1.00 AND v_fecha IS NULL);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'cot=' || COALESCE(v_cot::text,'NULL') || ' fecha=' || COALESCE(v_fecha::text,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','13. Misma moneda -> (1.00, NULL)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 14. billetera: extra OK / valida-inactiva rechazada
  BEGIN
    PERFORM public.fn_configurar_monedas_extra(ARRAY['USD', 'EUR']);
    v_id := public.fn_crear_billetera('probe eur extra', 'EUR', 0, '💳', CURRENT_DATE);
    v_ok := (v_id IS NOT NULL); v_err := CASE WHEN v_ok THEN NULL ELSE 'no devolvio id' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','14a. fn_crear_billetera acepta una extra (EUR)','ok',v_ok,'error',v_err);

  BEGIN
    PERFORM public.fn_crear_billetera('probe gbp inactiva', 'GBP', 0, '💳', CURRENT_DATE);
    v_ok := false; v_err := 'no lanzo excepcion';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_currency_not_local%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','14b. fn_crear_billetera rechaza GBP (valida pero fuera de las extras) con error_currency_not_local','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 15. sin pais (rama transitoria ausente en el cuerpo vivo)
  -- El cuerpo VIVO de fn_crear_billetera ya no tiene la rama transitoria de WU1
  -- (revertida por 50_revert_transitorio.mjs): sin pais configurado sigue
  -- rechazando con error_region_not_configured. Esta asercion confirma que T1 no
  -- reintroduce el agujero ni rompe el comportamiento actual.
  -- El UPDATE de dejar la region sin pais va FUERA del bloque con handler: un
  -- BEGIN..EXCEPTION en PL/pgSQL es una subtransaccion, y el handler revierte
  -- los cambios hechos DENTRO del bloque (incluido este UPDATE). Si queda
  -- adentro, 15b/15c verian la region restaurada y fallarian.
  UPDATE public.p_config_region SET pais_codigo = NULL, moneda_default = NULL WHERE user_id = v_user_id;
  BEGIN
    PERFORM public.fn_crear_billetera('probe sin pais', 'EUR', 0, '💳', CURRENT_DATE);
    v_ok := false; v_err := 'acepto crear billetera sin pais confirmado';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_region_not_configured%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','15. Sin pais: sigue error_region_not_configured (rama transitoria ausente; sin regresion)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 15b. las otras dos funciones
  BEGIN
    PERFORM public.fn_crear_billetera_inicial('probe sin pais inicial', 'EUR', 0, '💳');
    v_ok := false; v_err := 'acepto crear billetera inicial sin pais confirmado';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_region_not_configured%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','15b. fn_crear_billetera_inicial sin pais: sigue error_region_not_configured','ok',v_ok,'error',v_err);

  -- En este usuario las billeteras ya existen, y fn_crear_billeteras_iniciales
  -- chequea "ya existen billeteras iniciales" ANTES de la validacion de moneda:
  -- la unica forma de llegar al chequeo de region es desactivarlas TODO dentro
  -- de la transaccion (el rollback restaura; las secuencias se restauran con setval).
  UPDATE public.p_billeteras SET activa = false WHERE user_id = v_user_id AND activa = true;
  BEGIN
    PERFORM public.fn_crear_billeteras_iniciales('probe cuenta', 'EUR', 0, false, '💳', 'probe efectivo', 0, false, '💵');
    v_ok := false; v_err := 'acepto crear billeteras iniciales sin pais confirmado';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_region_not_configured%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','15c. fn_crear_billeteras_iniciales sin pais (con billeteras desactivadas in-txn): sigue error_region_not_configured','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ restauracion de secuencias quemadas
  -- Las secuencias IDENTITY no son transaccionales: nextval ya las quemo. setval
  -- es inmediato (sobrevive al rollback), asi que se ejecuta ANTES del RAISE
  -- final para devolver la base a su estado previo al test.
  PERFORM setval('public.p_billeteras_billetera_id_seq'::regclass, v_seq_b_last, v_seq_b_called);
  PERFORM setval('public.p_caja_p_caja_id_seq'::regclass, v_seq_c_last, v_seq_c_called);

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
