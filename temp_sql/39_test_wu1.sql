-- temp_sql/39_test_wu1.sql
-- Verificacion transaccional de la WU1.
--
-- No crea ningun RPC de testing y no deja datos: todo corre dentro de un bloque DO que termina
-- con una excepcion forzada, asi que Postgres revierte la transaccion completa. El reporte viaja
-- en el mensaje de la excepcion.
--
-- Uso: node --env-file=.env.local temp_sql/run_test_wu1.mjs

DO $test$
DECLARE
  v_resultados jsonb := '[]'::jsonb;
  v_user_id     bigint;
  v_auth_id     uuid;
  v_ok          boolean;
  v_err         text;
  v_n           int;
  v_cot         numeric;
  v_paises      int;
  v_val         numeric;
  v_txt         text;
  v_ts          timestamptz;
  v_pref        record;
BEGIN
  -- ------------------------------------------------------------------ setup
  SELECT u.user_id, u.auth_id INTO v_user_id, v_auth_id
  FROM public.usuarios u ORDER BY u.user_id LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_FORZADO:{"fatal":"no hay usuarios para testear"}';
  END IF;

  -- Identidad simulada para que auth.uid() devuelva este usuario.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_id::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_auth_id::text, true);

  -- ------------------------------------------------------------------ 1. catalogo
  BEGIN
    SELECT COUNT(*) INTO v_paises FROM public.fn_obtener_paises();
    v_ok := (v_paises = 72);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'se esperaban 72 paises activos, vinieron ' || v_paises END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','1. fn_obtener_paises devuelve 72 activos','ok',v_ok,'error',v_err);

  BEGIN
    v_ok := EXISTS (SELECT 1 FROM public.fn_obtener_paises() WHERE codigo = 'PY' AND moneda_local = 'PYG' AND moneda_decimales = 0)
        AND EXISTS (SELECT 1 FROM public.fn_obtener_paises() WHERE codigo = 'ES' AND moneda_local = 'EUR' AND formato_hora = '24h')
        AND EXISTS (SELECT 1 FROM public.fn_obtener_paises() WHERE codigo = 'US' AND moneda_local = 'USD' AND formato_hora = '12h');
    v_err := CASE WHEN v_ok THEN NULL ELSE 'PY/ES/US no salen como se esperaba' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','2. PY=PYG(0 dec), ES=EUR 24h, US=USD 12h','ok',v_ok,'error',v_err);

  BEGIN
    SELECT COUNT(*) INTO v_n
    FROM public.fn_obtener_paises() p
    WHERE NOT EXISTS (SELECT 1 FROM public.p_monedas m WHERE m.codigo = p.moneda_local);
    v_ok := (v_n = 0);
    v_err := CASE WHEN v_ok THEN NULL ELSE v_n || ' paises sin moneda en el catalogo' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','3. Todo pais activo tiene moneda en p_monedas','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 2. sin pais confirmado
  UPDATE public.p_config_region SET pais_codigo = NULL, moneda_default = NULL, confirmado_at = NULL WHERE user_id = v_user_id;

  BEGIN
    v_ok := (public.fn_get_default_currency(v_user_id) IS NULL);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'devolvio ' || COALESCE(public.fn_get_default_currency(v_user_id),'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','4. Sin pais, fn_get_default_currency devuelve NULL (no ARS)','ok',v_ok,'error',v_err);

  -- El frontend de produccion confirma el pais ANTES de crear billeteras (deploy de 2026-10-13),
  -- asi que el transitorio se revirtio: sin pais, crear billetera DEBE fallar con
  -- error_region_not_configured (y no queda usuario atrapado: el onboarding nunca llega aca).
  BEGIN
    PERFORM public.fn_crear_billetera(p_nombre := 'wallet sin pais', p_moneda := 'ARS', p_saldo_apertura := 0, p_icono := '💳', p_fecha_apertura := CURRENT_DATE);
    v_ok := false; v_err := 'acepto crear billetera sin pais confirmado (rama transitoria viva)';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_region_not_configured%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','5. Sin pais, crear billetera se rechaza con error_region_not_configured','ok',v_ok,'error',v_err);

  -- Sin la rama transitoria ya no hay camino donde el catalogo valide monedas sin pais:
  -- cualquier moneda se rechaza antes, con error_region_not_configured.
  BEGIN
    PERFORM public.fn_crear_billetera(p_nombre := 'wallet moneda trucha', p_moneda := 'ZZZ', p_saldo_apertura := 0, p_icono := '💳', p_fecha_apertura := CURRENT_DATE);
    v_ok := false; v_err := 'acepto crear billetera sin pais (ZZZ debio rechazarse antes o despues, pero rechazarse)';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_region_not_configured%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','5b. Sin pais, crear billetera rechaza (configurado el pais primero en 8)','ok',v_ok,'error',v_err);

  -- Esta es LA llamada que hace el onboarding de produccion, y la que dejaba a los usuarios nuevos
  -- atrapados sin billeteras. Se prueba contra un usuario real que hoy esta en ese estado.
  DECLARE
    v_uid_sin_pais uuid;
  BEGIN
    SELECT u.auth_id INTO v_uid_sin_pais
    FROM public.usuarios u
    WHERE NOT EXISTS (SELECT 1 FROM public.p_billeteras b WHERE b.user_id = u.user_id AND b.activa)
      AND NOT EXISTS (SELECT 1 FROM public.p_config_region r WHERE r.user_id = u.user_id AND r.pais_codigo IS NOT NULL)
    ORDER BY u.user_id LIMIT 1;

    IF v_uid_sin_pais IS NULL THEN
      v_resultados := v_resultados || jsonb_build_object('assertion','5c. Onboarding sin pais','ok',true,'error','(no hay usuarios en ese estado para probar)');
    ELSE
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid_sin_pais::text)::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_uid_sin_pais::text, true);
      BEGIN
        PERFORM public.fn_crear_billeteras_iniciales(
          p_cuenta_nombre := 'probe cuenta', p_cuenta_moneda := 'ARS', p_cuenta_saldo_apertura := 0,
          p_cuenta_saldo_omitido := true, p_cuenta_icono := '💳',
          p_efectivo_nombre := 'probe efectivo', p_efectivo_saldo_apertura := 0,
          p_efectivo_saldo_omitido := true, p_efectivo_icono := '💵');
        v_ok := false; v_err := 'acepto crear billeteras sin pais confirmado (rama transitoria viva)';
      EXCEPTION WHEN OTHERS THEN
        v_ok := (SQLERRM LIKE '%error_region_not_configured%');
        v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
      END;
      v_resultados := v_resultados || jsonb_build_object('assertion','5c. Sin pais, el onboarding de produccion se rechaza','ok',v_ok,'error',v_err);
      -- Se vuelve a la identidad del usuario de prueba para el resto del test.
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_id::text)::text, true);
      PERFORM set_config('request.jwt.claim.sub', v_auth_id::text, true);
    END IF;
  END;

  BEGIN
    SELECT public.fn_obtener_saldo_a_asignar(CURRENT_DATE) INTO v_val;
    v_ok := (v_val IS NOT NULL AND v_val = 0);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'devolvio ' || COALESCE(v_val::text,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','6. fn_obtener_saldo_a_asignar sin pais -> 0 explicito, no NULL','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 3. con pais AR
  PERFORM public.fn_configurar_region_usuario('AR', 'ARS', 'es', 'manual');
  SELECT moneda_default INTO v_txt FROM public.p_config_region WHERE user_id = v_user_id;

  BEGIN
    v_ok := (v_txt = 'ARS');
    v_err := CASE WHEN v_ok THEN NULL ELSE 'quedo en ' || COALESCE(v_txt, 'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','6b. La region del usuario queda con moneda ARS','ok',v_ok,'error',v_err);

  BEGIN
    v_ok := (public.fn_get_default_currency(v_user_id) = 'ARS');
    v_err := CASE WHEN v_ok THEN NULL ELSE 'devolvio ' || COALESCE(public.fn_get_default_currency(v_user_id),'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','7. fn_configurar_region_usuario(AR) deja ARS','ok',v_ok,'error',v_err);

  BEGIN
    PERFORM public.fn_crear_billetera(p_nombre := 'wallet eur', p_moneda := 'EUR', p_saldo_apertura := 0, p_icono := '💳', p_fecha_apertura := CURRENT_DATE);
    v_ok := false; v_err := 'no lanzo excepcion';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_currency_not_local%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','8. Moneda que no es la local ni USD -> error_currency_not_local','ok',v_ok,'error',v_err);

  BEGIN
    PERFORM public.fn_crear_billetera(p_nombre := 'wallet ars', p_moneda := 'ARS', p_saldo_apertura := 0, p_icono := '💳', p_fecha_apertura := CURRENT_DATE);
    PERFORM public.fn_crear_billetera(p_nombre := 'wallet usd', p_moneda := 'USD', p_saldo_apertura := 0, p_icono := '💳', p_fecha_apertura := CURRENT_DATE);
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','9. Moneda local (ARS) y segunda moneda (USD) -> OK','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 4. inflacion (H1)
  BEGIN
    PERFORM public.fn_configurar_inflacion('ZW', 'proxy_dolar');
    v_ok := false; v_err := 'no lanzo excepcion';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%error_country_not_supported%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','10. [H1] inflacion con pais no soportado -> error_country_not_supported','ok',v_ok,'error',v_err);

  BEGIN
    PERFORM public.fn_configurar_inflacion('ES', 'proxy_dolar');
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;  -- antes fallaba con 42P01
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','11. [H1] inflacion con pais soportado NO falla (antes 42P01)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 5. cotizacion (H2a)
  BEGIN
    SELECT (public.fn_reporte_patrimonio_neto_consolidado()->'actual'->>'cotizacion_usd')::numeric INTO v_cot;
    v_ok := (v_cot IS NOT NULL AND v_cot > 1);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'cotizacion_usd = ' || COALESCE(v_cot::text,'NULL') || ' (con el bug valia 1)' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','12. [H2a] patrimonio cotiza con la moneda local (ARS), no con 1','ok',v_ok,'error',v_err);

  BEGIN
    PERFORM 1 FROM public.fn_reporte_safe_to_spend();
    v_ok := true; v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','13. [H2a] fn_reporte_safe_to_spend corre sin error','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 6. preferencias
  BEGIN
    SELECT * INTO v_pref FROM public.fn_obtener_preferencias_usuario();
    v_ok := (v_pref.formato_hora IS NOT NULL);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'formato_hora vino NULL' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','14. fn_obtener_preferencias_usuario devuelve formato_hora','ok',v_ok,'error',v_err);

  BEGIN
    PERFORM public.fn_actualizar_preferencia_usuario(p_formato_hora := '12h');
    SELECT * INTO v_pref FROM public.fn_obtener_preferencias_usuario();
    v_ok := (v_pref.formato_hora = '12h');
    v_err := CASE WHEN v_ok THEN NULL ELSE 'quedo en ' || COALESCE(v_pref.formato_hora,'NULL') END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','15. fn_actualizar_preferencia_usuario(p_formato_hora) persiste','ok',v_ok,'error',v_err);

  BEGIN
    PERFORM public.fn_actualizar_preferencia_usuario(p_formato_hora := '13h');
    v_ok := false; v_err := 'acepto un valor invalido';
  EXCEPTION WHEN OTHERS THEN
    v_ok := (SQLERRM LIKE '%formato_hora%');
    v_err := CASE WHEN v_ok THEN NULL ELSE SQLERRM END;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','16. formato_hora rechaza valores fuera de 12h/24h','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 7. sin regresion para el usuario AR
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.fn_obtener_region_usuario()
    WHERE pais_codigo = 'AR' AND moneda_default = 'ARS' AND confirmado = true;
    v_ok := (v_n = 1);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'la region del usuario no quedo AR/ARS confirmada' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','17. Usuario con pais AR sigue funcionando igual (sin regresion)','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 8. confirmar el pais es explicito
  -- Configurar el formato regional (por ejemplo cambiar el idioma desde Configuracion) NO debe
  -- marcar el pais como confirmado: WU3 necesita distinguir "todavia no eligio" de "ya confirmo".
  UPDATE public.p_config_region SET confirmado_at = NULL, origen_pais = NULL WHERE user_id = v_user_id;

  BEGIN
    PERFORM public.fn_configurar_region_usuario('AR', 'ARS', 'es');   -- sin p_origen
    SELECT confirmado_at INTO v_ts FROM public.p_config_region WHERE user_id = v_user_id;
    v_ok := (v_ts IS NULL);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'confirmado_at quedo en ' || v_ts::text END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','18. Cambiar el idioma NO marca el pais como confirmado','ok',v_ok,'error',v_err);

  BEGIN
    PERFORM public.fn_configurar_region_usuario('AR', 'ARS', 'es', 'locale');
    SELECT confirmado_at INTO v_ts FROM public.p_config_region WHERE user_id = v_user_id;
    v_ok := (v_ts IS NOT NULL);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'confirmado_at quedo NULL pese a mandar p_origen' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','19. Confirmar el pais (con p_origen) SI lo marca','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ 9. el pais deriva los formatos
  -- Espana: el euro tiene 2 decimales (el default argentino es 0) y la segunda moneda 2 (el default es 1).
  BEGIN
    PERFORM public.fn_configurar_region_usuario('ES', 'EUR', 'es', 'manual');
    SELECT * INTO v_pref FROM public.fn_obtener_preferencias_usuario();
    v_ok := (v_pref.decimales_moneda_local = 2 AND v_pref.decimales_segunda_moneda = 2 AND v_pref.formato_hora = '24h');
    v_err := CASE WHEN v_ok THEN NULL ELSE 'quedo local=' || v_pref.decimales_moneda_local || ' usd=' || v_pref.decimales_segunda_moneda || ' hora=' || v_pref.formato_hora END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','20. Confirmar ES deriva 2 decimales (local y USD) desde el catalogo','ok',v_ok,'error',v_err);

  -- Paraguay: PYG no usa decimales. Prueba que no esta fijo en 2.
  BEGIN
    PERFORM public.fn_configurar_region_usuario('PY', 'PYG', 'es');
    SELECT * INTO v_pref FROM public.fn_obtener_preferencias_usuario();
    v_ok := (v_pref.decimales_moneda_local = 0);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'PYG quedo con ' || v_pref.decimales_moneda_local || ' decimales' END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','21. Confirmar PY deja 0 decimales para PYG','ok',v_ok,'error',v_err);

  -- Un cambio que NO es de pais (mismo pais, sin p_origen: cambiar el idioma desde Configuracion)
  -- no debe pisar los decimales elegidos a mano.
  BEGIN
    PERFORM public.fn_actualizar_preferencia_usuario(p_decimales_moneda_local := 3::smallint);
    PERFORM public.fn_configurar_region_usuario('PY', 'PYG', 'en');   -- mismo pais, sin p_origen
    SELECT * INTO v_pref FROM public.fn_obtener_preferencias_usuario();
    v_ok := (v_pref.decimales_moneda_local = 3);
    v_err := CASE WHEN v_ok THEN NULL ELSE 'el cambio de idioma piso los decimales a ' || v_pref.decimales_moneda_local END;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  v_resultados := v_resultados || jsonb_build_object('assertion','22. Cambiar el idioma NO pisa los formatos elegidos a mano','ok',v_ok,'error',v_err);

  -- ------------------------------------------------------------------ reporte
  DECLARE
    v_fallos int;
  BEGIN
    SELECT COUNT(*) INTO v_fallos FROM jsonb_array_elements(v_resultados) e WHERE (e->>'ok')::boolean IS NOT TRUE;
    RAISE EXCEPTION 'ROLLBACK_FORZADO|result=%|fallos=%|%',
      CASE WHEN v_fallos = 0 THEN 'PASS' ELSE 'FAIL' END, v_fallos, v_resultados::text;
  END;
END
$test$;
