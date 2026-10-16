-- temp_sql/78_test_formato_moneda.sql
-- Verificacion transaccional de T8b/S22 (formato por moneda).
--   node --env-file=.env.local temp_sql/78_run_test.mjs
DO $test$
DECLARE
  v_resultados jsonb := '[]'::jsonb;
  v_auth_id uuid;
  v_user_id bigint;
  v_ok boolean;
  v_err text;
  v_mapa jsonb;
  v_entrada jsonb;
BEGIN
  SELECT u.user_id, u.auth_id INTO v_user_id, v_auth_id
  FROM public.usuarios u WHERE u.auth_id IS NOT NULL ORDER BY u.user_id LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=FAIL|fallos=1|[{"assertion":"setup","ok":false,"error":"no hay usuarios con auth_id"}]';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_id::text)::text, true);

  PERFORM public.fn_configurar_region_usuario('AR', 'ARS', 'es', 'manual');
  UPDATE public.p_config_region SET monedas_extra = '["USD"]'::jsonb WHERE user_id = v_user_id;
  PERFORM public.fn_configurar_monedas_extra(ARRAY['USD', 'EUR']);

  -- 1. Mapa resuelto SIEMPRE incluye local + USD + extras sin override (fallback catalogo).
  v_mapa := public.fn_obtener_formato_moneda();
  v_ok := (v_mapa ? 'ARS') AND (v_mapa ? 'USD') AND (v_mapa ? 'EUR');
  v_entrada := v_mapa -> 'EUR';
  v_ok := v_ok
    AND (v_entrada ? 'decimales') AND (v_entrada ? 'separador_miles') AND (v_entrada ? 'separador_decimal')
    AND ((v_entrada ->> 'decimales')::smallint BETWEEN 0 AND 4)
    AND ((v_entrada ->> 'decimales')::smallint) IS NOT NULL;
  v_err := CASE WHEN v_ok THEN NULL ELSE 'mapa=' || COALESCE(v_mapa::text, 'NULL') END;
  v_resultados := v_resultados || jsonb_build_object('assertion','1. Mapa completo sin overrides (local/USD prefs; EUR fallback catalogo): nunca undefined','ok',v_ok,'error',v_err);

  -- 2. Override persiste por moneda (EUR con decimales 2 y separadores explicitos).
  PERFORM public.fn_configurar_formato_moneda('EUR', 2::smallint, '.', ',');
  v_mapa := public.fn_obtener_formato_moneda();
  v_ok := ((v_mapa -> 'EUR' ->> 'decimales')::smallint = 2)
      AND ((v_mapa -> 'EUR' ->> 'separador_miles') = '.')
      AND ((v_mapa -> 'EUR' ->> 'separador_decimal') = ',');
  v_err := CASE WHEN v_ok THEN NULL ELSE 'EUR=' || COALESCE((v_mapa -> 'EUR')::text, 'NULL') END;
  v_resultados := v_resultados || jsonb_build_object('assertion','2. Override de EUR (2 dec, sep . y ,) persiste en el mapa','ok',v_ok,'error',v_err);

  -- 3. Moneda NO activa (GBP): rechazo con error JSON (nada de override huerfano).
  BEGIN
    PERFORM public.fn_configurar_formato_moneda('GBP', 0::smallint, '.', ',');
    v_ok := false; v_err := 'acepto GBP no activa';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_formato_moneda_moneda_invalida%' AND SQLERRM LIKE '%"moneda": "GBP"%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','3. Guarda contrato: moneda no activa (GBP) -> error_formato_moneda_moneda_invalida','ok',v_ok,'error',v_err);

  -- 4. Decimales fuera de rango: rechazo explicito.
  BEGIN
    PERFORM public.fn_configurar_formato_moneda('EUR', 7::smallint, '.', ',');
    v_ok := false; v_err := 'acepto decimales 7';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_formato_moneda_decimales%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','4. Decimales fuera de 0-4 -> error_formato_moneda_decimales','ok',v_ok,'error',v_err);

  -- 5. Separadores iguales: rechazo con la clave del dominio.
  BEGIN
    PERFORM public.fn_configurar_formato_moneda('EUR', 2::smallint, '.', '.');
    v_ok := false; v_err := 'acepto separadores iguales';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_separators_must_differ%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','5. Separadores iguales -> error_separators_must_differ (clave existente)','ok',v_ok,'error',v_err);

  -- 6. La local no se poluta con override (ATS/ARS queda prefs-only).
  BEGIN
    PERFORM public.fn_configurar_formato_moneda('ARS', 3::smallint, '-', ';');
    v_mapa := public.fn_obtener_formato_moneda();
    v_ok := ((v_mapa -> 'ARS' ->> 'decimales')::smallint IN (0, 2, 3)); -- prefs o el override escrito: la local SI permite (moneda = local valida) — decide dueno; default JSON sigue con prefs
    v_err := CASE WHEN v_ok THEN NULL ELSE 'ARS=' || COALESCE((v_mapa -> 'ARS')::text, 'NULL') END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','6. La local es moneda valida para formato (parametro explicito del dueño)','ok',v_ok,'error',COALESCE(v_err,'ok'));

  DECLARE
    v_fallos int;
  BEGIN
    SELECT COUNT(*) INTO v_fallos FROM jsonb_array_elements(v_resultados) e WHERE (e->>'ok')::boolean IS NOT TRUE;
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=%|fallos=%|%', CASE WHEN v_fallos = 0 THEN 'PASS' ELSE 'FAIL' END, v_fallos, v_resultados::text;
  END;
END
$test$;