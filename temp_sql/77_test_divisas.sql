-- temp_sql/77_test_divisas.sql
-- Verificacion transaccional de fn_obtener_divisas_cotizadas (77).
--   node --env-file=.env.local temp_sql/77_run_test.mjs

DO $test$
DECLARE
  v_resultados jsonb := '[]'::jsonb;
  v_auth_id uuid;
  v_arr text[];
  v_ordenado boolean;
  v_sin_null boolean;
  v_n int;
  v_ok boolean;
BEGIN
  SELECT u.auth_id INTO v_auth_id FROM public.usuarios u WHERE u.auth_id IS NOT NULL ORDER BY u.user_id LIMIT 1;
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=FAIL|fallos=1|[{"assertion":"setup","ok":false,"error":"no hay usuarios con auth_id"}]';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_id::text)::text, true);

  -- 1. Catalogo no vacio (el cron cubre ~51 monedas).
  SELECT public.fn_obtener_divisas_cotizadas() INTO v_arr;
  v_n := COALESCE(array_length(v_arr, 1), 0);
  v_ok := v_n >= 30;
  v_resultados := v_resultados || jsonb_build_object('assertion','1. Catalogo cotizado no vacio (>=30 monedas; cron al dia)','ok',v_ok,'error',CASE WHEN v_ok THEN NULL ELSE 'n=' || v_n::text END);

  -- 2. USD esta (extra default del usuario y cotizada seguro).
  v_ok := 'USD' = ANY(v_arr);
  v_resultados := v_resultados || jsonb_build_object('assertion','2. USD presente (extra default)','ok',v_ok,'error',CASE WHEN v_ok THEN NULL ELSE 'USD ausente de ' || v_n::text END);

  -- 3. Sin nulos ni vacios (el filtro ultima_actualizacion IS NOT NULL).
  SELECT NOT EXISTS (SELECT 1 FROM unnest(v_arr) e(m) WHERE m IS NULL OR m = '') INTO v_sin_null;
  v_resultados := v_resultados || jsonb_build_object('assertion','3. Sin monedas nulas/vacias','ok',v_sin_null,'error',CASE WHEN v_sin_null THEN NULL ELSE 'hay filas vacias' END);

  -- 4. Orden alfabetico (el ORDER BY DISTINCT del helper).
  SELECT array_agg(x ORDER BY x) = v_arr INTO v_ordenado FROM unnest(v_arr) t(x);
  v_resultados := v_resultados || jsonb_build_object('assertion','4. Orden alfabetico estable','ok',v_ordenado,'error',CASE WHEN v_ordenado THEN NULL ELSE 'orden no alfabetico' END);

  DECLARE
    v_fallos int;
  BEGIN
    SELECT COUNT(*) INTO v_fallos FROM jsonb_array_elements(v_resultados) e WHERE (e->>'ok')::boolean IS NOT TRUE;
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=%|fallos=%|%',
      CASE WHEN v_fallos = 0 THEN 'PASS' ELSE 'FAIL' END, v_fallos, v_resultados::text;
  END;
END
$test$;