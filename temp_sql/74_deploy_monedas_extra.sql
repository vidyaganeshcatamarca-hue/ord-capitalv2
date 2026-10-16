-- temp_sql/74_deploy_monedas_extra.sql
-- =====================================================================
-- T1 - Backend monedas extra libres (S5,S7,S8,S9,S11,S13,S14,S15).
--
--   * p_config_region.monedas_extra  jsonb NOT NULL DEFAULT '["USD"]'
--     (capacidad N, nadie migrado: los usuarios vivos conservan local+USD, S8/S13).
--   * fn_obtener_monedas_extra()                 -> extras efectivas del usuario (S10/S11).
--   * fn_configurar_monedas_extra(p_monedas)     -> alta/baja validada (S5/S9/S14).
--   * fn_obtener_cotizacion(origen,destino)      -> pivote USD sobre p_divisas (S7/S15).
--   * fn_crear_billetera / _inicial / s_iniciales -> validan contra local+extras
--     (reemplaza el 'USD' hardcodeado) manteniendo la MISMA clave error_currency_not_local.
--
-- Claves i18n NUEVAS que T8 tiene que traducir:
--   error_monedas_extra_limite   {max,count}
--   error_monedas_extra_local    {currency}
--   error_monedas_extra_duplicada{currency}
--   error_monedas_extra_invalida {currency}
--   error_monedas_extra_has_wallets {currency,count}
--
-- Idempotente: DROP por firma EXACTA + CREATE OR REPLACE.
-- NO toca tarjetas, fn_aprobar_cuarentena_v2, fn_registrar_movimiento_caja
-- ni fn_obtener_cotizacion_usd.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columna nueva (S8/S13)
-- ---------------------------------------------------------------------
ALTER TABLE public.p_config_region
    ADD COLUMN IF NOT EXISTS monedas_extra jsonb NOT NULL DEFAULT '["USD"]'::jsonb;

-- ---------------------------------------------------------------------
-- 2. Extras efectivas del usuario (S10/S11)
--    Uppercase + dedupe + excluye la moneda local (un usuario USD obtiene []).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_obtener_monedas_extra();

CREATE OR REPLACE FUNCTION public.fn_obtener_monedas_extra()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_monedas jsonb;
    v_local   text;
    v_out     jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT r.monedas_extra, r.moneda_default
      INTO v_monedas, v_local
      FROM public.p_config_region r
     WHERE r.user_id = v_user_id;

    v_monedas := COALESCE(v_monedas, '["USD"]'::jsonb);
    v_local   := UPPER(TRIM(COALESCE(v_local, '')));

    SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO v_out
    FROM (
        SELECT UPPER(TRIM(t.x)) AS x, MIN(t.ord) AS ord
        FROM jsonb_array_elements_text(v_monedas) WITH ORDINALITY AS t(x, ord)
        WHERE UPPER(TRIM(t.x)) <> ''
          AND UPPER(TRIM(t.x)) <> v_local
        GROUP BY UPPER(TRIM(t.x))
    ) s;

    RETURN v_out;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. Configurar extras del usuario (S5/S9/S14)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_configurar_monedas_extra(text[]);

CREATE OR REPLACE FUNCTION public.fn_configurar_monedas_extra(p_monedas text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_local   text;
    v_actual  jsonb;
    v_norm    text[] := ARRAY[]::text[];
    v_item    text;
    v_removed text;
    v_wallets int;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF p_monedas IS NULL THEN
        p_monedas := ARRAY[]::text[];
    END IF;

    -- Flatten: un text[][] (ej. 2x2 con 4 monedas distintas) NO puede colarse por el
    -- limite de la dimension 1. Cardinality() cuenta TODOS los elementos de TODAS
    -- las dimensiones (S5); el FOREACH de abajo itera el mismo conjunto.
    IF cardinality(p_monedas) > 2 THEN
        RAISE EXCEPTION '%', jsonb_build_object(
            'key', 'error_monedas_extra_limite',
            'params', jsonb_build_object('max', 2, 'count', cardinality(p_monedas)))::text;
    END IF;

    SELECT r.monedas_extra, UPPER(TRIM(COALESCE(r.moneda_default, '')))
      INTO v_actual, v_local
      FROM public.p_config_region r
     WHERE r.user_id = v_user_id
     FOR UPDATE;   -- serializa contra fn_crear_billetera* y otra ejecucion de esta misma funcion

    v_actual := COALESCE(v_actual, '["USD"]'::jsonb);
    v_local  := COALESCE(v_local, '');

    -- Normaliza a MAYUSCULAS y valida: no local, sin duplicados, catalogo p_divisas (S9).
    FOREACH v_item IN ARRAY p_monedas LOOP
        v_item := UPPER(TRIM(COALESCE(v_item, '')));
        IF v_item = '' THEN
            CONTINUE;
        END IF;
        IF v_item = v_local THEN
            RAISE EXCEPTION '%', jsonb_build_object(
                'key', 'error_monedas_extra_local',
                'params', jsonb_build_object('currency', v_item))::text;
        END IF;
        IF v_item = ANY(v_norm) THEN
            RAISE EXCEPTION '%', jsonb_build_object(
                'key', 'error_monedas_extra_duplicada',
                'params', jsonb_build_object('currency', v_item))::text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.p_divisas d WHERE d.nombre = v_item) THEN
            RAISE EXCEPTION '%', jsonb_build_object(
                'key', 'error_monedas_extra_invalida',
                'params', jsonb_build_object('currency', v_item))::text;
        END IF;
        v_norm := v_norm || v_item;
    END LOOP;

    -- S14: quitar/reemplazar una extra con billeteras activas queda bloqueado.
    FOR v_removed IN
        SELECT DISTINCT UPPER(TRIM(t.x))
        FROM jsonb_array_elements_text(v_actual) AS t(x)
        WHERE UPPER(TRIM(t.x)) <> ''
          AND UPPER(TRIM(t.x)) <> v_local
          AND NOT (UPPER(TRIM(t.x)) = ANY(v_norm))
    LOOP
        SELECT count(*) INTO v_wallets
        FROM public.p_billeteras b
        WHERE b.user_id = v_user_id
          AND b.moneda = v_removed
          AND b.activa = true;
        IF v_wallets > 0 THEN
            RAISE EXCEPTION '%', jsonb_build_object(
                'key', 'error_monedas_extra_has_wallets',
                'params', jsonb_build_object('currency', v_removed, 'count', v_wallets))::text;
        END IF;
    END LOOP;

    UPDATE public.p_config_region
       SET monedas_extra = to_jsonb(v_norm)
     WHERE user_id = v_user_id;
    IF NOT FOUND THEN
        INSERT INTO public.p_config_region (user_id, monedas_extra)
        VALUES (v_user_id, to_jsonb(v_norm));
    END IF;

    RETURN to_jsonb(v_norm);
END;
$function$;

-- ---------------------------------------------------------------------
-- 4. Cotizacion generica por pivote USD (S7/S15)
--    cotizacion(origen,destino) = valor_por_usd(destino) / valor_por_usd(origen)
--    fecha = la MAS VIEJA de las dos ultima_actualizacion (frescura honesta, S15).
--    Moneda ausente => (NULL, NULL). NUNCA 1.00 (D17).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_obtener_cotizacion(text, text);

CREATE OR REPLACE FUNCTION public.fn_obtener_cotizacion(p_origen text, p_destino text)
 RETURNS TABLE(cotizacion numeric, fecha date)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_origen       text;
    v_destino      text;
    v_rate_origen  numeric;
    v_rate_destino numeric;
    v_fecha_origen  timestamptz;
    v_fecha_destino timestamptz;
BEGIN
    v_origen  := UPPER(TRIM(COALESCE(p_origen, '')));
    v_destino := UPPER(TRIM(COALESCE(p_destino, '')));

    -- Cotizacion generica por pivote USD (S7/S15).
    --   cotizacion(origen,destino) = valor_por_usd(destino) / valor_por_usd(origen)
    --   fecha = la MAS VIEJA de las dos ultima_actualizacion (frescura honesta, S15).
    --   Moneda AUSENTE en p_divisas -> (NULL, NULL). NUNCA 1.00 (D17).
    --   Identidad misma-moneda -> (1.00, NULL) por definicion, sin pasar por p_divisas:
    --   es una conversion trivial entre cuentas de la misma divisa (S4), no una "tasa";
    --   D17 solo protege contra monedas que NO se podrian convertir.
    IF v_origen = '' OR v_destino = '' THEN
        RETURN QUERY SELECT NULL::numeric, NULL::date;
        RETURN;
    END IF;

    IF v_origen = v_destino THEN
        RETURN QUERY SELECT 1.00::numeric, NULL::date;
        RETURN;
    END IF;

    SELECT d.valor_por_usd, d.ultima_actualizacion
      INTO v_rate_origen, v_fecha_origen
      FROM public.p_divisas d
     WHERE d.nombre = v_origen
     ORDER BY d.ultima_actualizacion DESC
     LIMIT 1;

    SELECT d.valor_por_usd, d.ultima_actualizacion
      INTO v_rate_destino, v_fecha_destino
      FROM public.p_divisas d
     WHERE d.nombre = v_destino
     ORDER BY d.ultima_actualizacion DESC
     LIMIT 1;

    IF v_rate_origen IS NULL OR v_rate_destino IS NULL
       OR v_rate_origen = 0 OR v_rate_destino = 0 THEN
        RETURN QUERY SELECT NULL::numeric, NULL::date;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT (v_rate_destino / v_rate_origen)::numeric,
           LEAST(v_fecha_origen, v_fecha_destino)::date;
END;
$function$;

-- ---------------------------------------------------------------------
-- 5. fn_crear_billetera: valida local + extras activas (S11).
--    Se preserva el rechazo sin pais confirmado (error_region_not_configured):
--    la rama transitoria de WU1 NO esta en el cuerpo vivo (se revirtio en el
--    deploy 50_revert_transitorio.mjs); no se reintroduce.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_crear_billetera(text, text, numeric, text, date);

CREATE OR REPLACE FUNCTION public.fn_crear_billetera(p_nombre text, p_moneda text DEFAULT NULL::text, p_saldo_apertura numeric DEFAULT 0, p_icono text DEFAULT '💳'::text, p_fecha_apertura date DEFAULT CURRENT_DATE)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_billetera_id bigint; v_moneda_final text; v_moneda_local text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    IF p_nombre IS NULL OR trim(p_nombre) = '' THEN RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "nombre"}}'; END IF;

    v_moneda_local := public.fn_get_default_currency(v_user_id);
    v_moneda_final := UPPER(TRIM(COALESCE(p_moneda, v_moneda_local)));

    IF v_moneda_local IS NULL THEN
      RAISE EXCEPTION '{"key": "error_region_not_configured", "params": {}}';
    ELSIF v_moneda_final <> v_moneda_local
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(public.fn_obtener_monedas_extra()) AS e(m)
            WHERE e.m = v_moneda_final
          ) THEN
      RAISE EXCEPTION '{"key": "error_currency_not_local", "params": {}}';
    END IF;

    INSERT INTO p_billeteras (nombre, moneda, saldo_actual, user_id, activa, es_fondo_prevision, es_compartida, icono, ultima_conciliacion_at)
    VALUES (p_nombre, v_moneda_final, 0, v_user_id, true, false, false, p_icono, CURRENT_TIMESTAMP) RETURNING billetera_id INTO v_billetera_id;

    IF p_saldo_apertura > 0 THEN
        INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso, fecha, detalle, moneda)
        VALUES (v_user_id, 'opening', v_billetera_id, p_saldo_apertura, 0, COALESCE(p_fecha_apertura, CURRENT_DATE), 'initial_balance', v_moneda_final);
    END IF;
    RETURN v_billetera_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 6. fn_crear_billetera_inicial (misma validacion local + extras)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_crear_billetera_inicial(text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.fn_crear_billetera_inicial(p_nombre text, p_moneda text DEFAULT NULL::text, p_saldo_apertura numeric DEFAULT 0, p_icono text DEFAULT '💳'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_billetera_id bigint; v_caja_id bigint; v_moneda_final text; v_moneda_local text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    IF p_nombre IS NULL OR trim(p_nombre) = '' THEN RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "nombre"}}'; END IF;
    IF p_saldo_apertura < 0 THEN RAISE EXCEPTION '{"key": "error_opening_balance_negative", "params": {}}'; END IF;

    v_moneda_local := public.fn_get_default_currency(v_user_id);
    v_moneda_final := UPPER(TRIM(COALESCE(p_moneda, v_moneda_local)));

    IF v_moneda_local IS NULL THEN
      RAISE EXCEPTION '{"key": "error_region_not_configured", "params": {}}';
    ELSIF v_moneda_final <> v_moneda_local
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(public.fn_obtener_monedas_extra()) AS e(m)
            WHERE e.m = v_moneda_final
          ) THEN
      RAISE EXCEPTION '{"key": "error_currency_not_local", "params": {}}';
    END IF;


    INSERT INTO p_billeteras (nombre, moneda, saldo_actual, user_id, activa, es_fondo_prevision, es_compartida, icono, ultima_conciliacion_at)
    VALUES (p_nombre, v_moneda_final, 0, v_user_id, true, false, false, COALESCE(p_icono, '💳'), CURRENT_TIMESTAMP) RETURNING billetera_id INTO v_billetera_id;

    IF p_saldo_apertura > 0 THEN
        INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso, fecha, detalle, moneda)
        VALUES (v_user_id, 'opening', v_billetera_id, p_saldo_apertura, 0, CURRENT_DATE, 'initial_balance_account_creation', v_moneda_final) RETURNING p_caja_id INTO v_caja_id;
    END IF;
    RETURN v_billetera_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 7. fn_crear_billeteras_iniciales (misma validacion local + extras)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_crear_billeteras_iniciales(text, text, numeric, boolean, text, text, numeric, boolean, text);

CREATE OR REPLACE FUNCTION public.fn_crear_billeteras_iniciales(p_cuenta_nombre text, p_cuenta_moneda text DEFAULT NULL::text, p_cuenta_saldo_apertura numeric DEFAULT 0, p_cuenta_saldo_omitido boolean DEFAULT false, p_cuenta_icono text DEFAULT '💳'::text, p_efectivo_nombre text DEFAULT NULL::text, p_efectivo_saldo_apertura numeric DEFAULT 0, p_efectivo_saldo_omitido boolean DEFAULT false, p_efectivo_icono text DEFAULT '💵'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_cuenta_id bigint := NULL;
  v_efectivo_id bigint;
  v_moneda_final text;
  v_moneda_local text;
  v_cuenta_saldo_inicial numeric := ROUND(p_cuenta_saldo_apertura, 0);
  v_efectivo_saldo_inicial numeric := ROUND(p_efectivo_saldo_apertura, 0);
BEGIN
  SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false
  ) THEN
    RAISE EXCEPTION '{"key": "error_initial_wallets_already_exist", "params": {}}';
  END IF;

  IF p_efectivo_nombre IS NULL OR trim(p_efectivo_nombre) = '' THEN
    RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "efectivo_nombre"}}';
  END IF;

  IF p_cuenta_nombre IS NOT NULL AND trim(p_cuenta_nombre) != '' THEN
    IF lower(trim(p_cuenta_nombre)) = lower(trim(p_efectivo_nombre)) THEN
      RAISE EXCEPTION '{"key": "error_initial_wallet_names_must_differ", "params": {}}';
    END IF;
  END IF;

  IF v_cuenta_saldo_inicial < 0 OR v_efectivo_saldo_inicial < 0 THEN
    RAISE EXCEPTION '{"key": "error_opening_balance_negative", "params": {}}';
  END IF;

  v_moneda_local := public.fn_get_default_currency(v_user_id);
  v_moneda_final := UPPER(TRIM(COALESCE(p_cuenta_moneda, v_moneda_local)));

  IF v_moneda_local IS NULL THEN
      RAISE EXCEPTION '{"key": "error_region_not_configured", "params": {}}';
    ELSIF v_moneda_final <> v_moneda_local
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(public.fn_obtener_monedas_extra()) AS e(m)
            WHERE e.m = v_moneda_final
          ) THEN
      RAISE EXCEPTION '{"key": "error_currency_not_local", "params": {}}';
    END IF;


  -- 1. Crear cuenta bancaria/principal (Opcional)
  IF p_cuenta_nombre IS NOT NULL AND trim(p_cuenta_nombre) != '' THEN
    INSERT INTO public.p_billeteras (nombre, moneda, saldo_actual, user_id, activa, es_fondo_prevision, es_compartida, icono, ultima_conciliacion_at, saldo_inicial_pendiente)
    VALUES (trim(p_cuenta_nombre), v_moneda_final, 0, v_user_id, true, false, false, COALESCE(p_cuenta_icono, '💳'), now(), COALESCE(p_cuenta_saldo_omitido, false))
    RETURNING billetera_id INTO v_cuenta_id;

    IF COALESCE(p_cuenta_saldo_omitido, false) = false AND v_cuenta_saldo_inicial > 0 THEN
      INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso, fecha, detalle, moneda)
      VALUES (v_user_id, 'opening', v_cuenta_id, v_cuenta_saldo_inicial, 0, CURRENT_DATE, 'initial_balance_account_creation', v_moneda_final);
    END IF;
  END IF;

  -- 2. Crear cuenta de Efectivo (Obligatorio)
  INSERT INTO public.p_billeteras (nombre, moneda, saldo_actual, user_id, activa, es_fondo_prevision, es_compartida, icono, ultima_conciliacion_at, saldo_inicial_pendiente)
  VALUES (trim(p_efectivo_nombre), v_moneda_final, 0, v_user_id, true, false, false, COALESCE(p_efectivo_icono, '💵'), now(), COALESCE(p_efectivo_saldo_omitido, false))
  RETURNING billetera_id INTO v_efectivo_id;

  IF COALESCE(p_efectivo_saldo_omitido, false) = false AND v_efectivo_saldo_inicial > 0 THEN
    INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso, fecha, detalle, moneda)
    VALUES (v_user_id, 'opening', v_efectivo_id, v_efectivo_saldo_inicial, 0, CURRENT_DATE, 'initial_balance_cash_creation', v_moneda_final);
  END IF;

  RETURN jsonb_build_object(
    'cuenta_billetera_id', v_cuenta_id,
    'efectivo_billetera_id', v_efectivo_id
  );
END;
$function$;
