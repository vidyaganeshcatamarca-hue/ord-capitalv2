-- temp_sql/79_test_formato_usuarios.sql
-- Tanda 2: el mapa de formato = SOLO las monedas del usuario (sin USD fantasma).
--   node --env-file=.env.local temp_sql/79_run_test.mjs
DO $test$
DECLARE
  v_resultados jsonb := '[]'::jsonb;
  v_auth_id uuid;
  v_ok boolean;
  v_err text;
  v_mapa jsonb;
BEGIN
  SELECT u.auth_id INTO v_auth_id FROM public.usuarios u WHERE u.auth_id IS NOT NULL ORDER BY u.user_id LIMIT 1;
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=FAIL|fallos=1|[{"assertion":"setup","ok":false,"error":"no hay usuarios"}]';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_id::text)::text, true);

  PERFORM public.fn_configurar_region_usuario('AR', 'ARS', 'es', 'manual');
  -- El usuario de prueba tiene billeteras activas (USD y quizá otras): el
  -- guard S14 bloquearía TODA reconfiguración del set. Las desactivo in-txn
  -- (el rollback del test las restaura); sin billeteras activas, S14 no aplica.
  UPDATE public.p_billeteras SET activa = false
   WHERE user_id = (SELECT u0.user_id FROM public.usuarios u0 WHERE u0.auth_id = v_auth_id)
     AND activa = true;
  PERFORM public.fn_configurar_monedas_extra(ARRAY['CHF', 'EUR']);

  -- 1. Mapa SIN USD fantasma: solo ARS + CHF + EUR.
  v_mapa := public.fn_obtener_formato_moneda();
  v_ok := (NOT (v_mapa ? 'USD')) AND (v_mapa ? 'ARS') AND (v_mapa ? 'CHF') AND (v_mapa ? 'EUR');
  v_err := CASE WHEN v_ok THEN NULL ELSE 'mapa=' || COALESCE(v_mapa::text, 'NULL') END;
  v_resultados := v_resultados || jsonb_build_object('assertion','1. Mapa = solo monedas del usuario: sin USD fantasma cuando no es extra','ok',v_ok,'error',v_err);

  -- 2. USD COMO extra del usuario: entra y hereda decimales_segunda_moneda.
  PERFORM public.fn_configurar_monedas_extra(ARRAY['USD', 'EUR']);
  v_mapa := public.fn_obtener_formato_moneda();
  v_ok := (v_mapa ? 'USD') AND ((v_mapa -> 'USD' ->> 'decimales')::smallint IS NOT NULL)
      AND (v_mapa ? 'EUR') AND (NOT (v_mapa ? 'CHF'));
  v_err := CASE WHEN v_ok THEN NULL ELSE 'mapa=' || COALESCE(v_mapa::text, 'NULL') END;
  v_resultados := v_resultados || jsonb_build_object('assertion','2. USD como extra entra al mapa y hereda decimales_segunda_moneda (comportamiento historico)','ok',v_ok,'error',v_err);

  -- 3. Override de la local sigue teniendo prioridad (UI por moneda del peer).
  PERFORM public.fn_configurar_formato_moneda('ARS', 3::smallint, '|', '~');
  v_mapa := public.fn_obtener_formato_moneda();
  v_ok := ((v_mapa -> 'ARS' ->> 'decimales')::smallint = 3) AND ((v_mapa -> 'ARS' ->> 'separador_miles') = '|');
  v_err := CASE WHEN v_ok THEN NULL ELSE 'ARS=' || COALESCE((v_mapa -> 'ARS')::text, 'NULL') END;
  v_resultados := v_resultados || jsonb_build_object('assertion','3. Override de la local prioriza sobre prefs (config por moneda de la UI nueva)','ok',v_ok,'error',v_err);

  -- 4. Regla del dueño: set VACÍO -> USD vuelve como 2ª por defecto (S13).
  PERFORM public.fn_configurar_monedas_extra(ARRAY[]::text[]);
  v_mapa := public.fn_obtener_formato_moneda();
  v_ok := (v_mapa ? 'USD') AND (v_mapa ? 'ARS') AND (NOT (v_mapa ? 'EUR'))
      AND ((v_mapa -> 'USD' ->> 'decimales')::smallint IS NOT NULL);
  v_err := CASE WHEN v_ok THEN NULL ELSE 'mapa=' || COALESCE(v_mapa::text, 'NULL') END;
  v_resultados := v_resultados || jsonb_build_object('assertion','4. Set vacío -> USD default de segunda (decimales_segunda_moneda), regla del dueño','ok',v_ok,'error',v_err);

  DECLARE
    v_fallos int;
  BEGIN
    SELECT COUNT(*) INTO v_fallos FROM jsonb_array_elements(v_resultados) e WHERE (e->>'ok')::boolean IS NOT TRUE;
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=%|fallos=%|%', CASE WHEN v_fallos = 0 THEN 'PASS' ELSE 'FAIL' END, v_fallos, v_resultados::text;
  END;
END
$test$;