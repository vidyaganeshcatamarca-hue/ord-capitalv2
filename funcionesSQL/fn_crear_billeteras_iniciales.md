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
  v_moneda_final := COALESCE(p_cuenta_moneda, v_moneda_local);

      IF v_moneda_local IS NULL THEN
      RAISE EXCEPTION '{"key": "error_region_not_configured", "params": {}}';
    ELSIF v_moneda_final <> 'USD' AND v_moneda_final <> v_moneda_local THEN
      RAISE EXCEPTION '{"key": "error_currency_not_local", "params": {}}';
    END IF;


  -- 1. Crear cuenta bancaria/principal (Opcional)
  IF p_cuenta_nombre IS NOT NULL AND trim(p_cuenta_nombre) != '' THEN
    INSERT INTO public.p_billeteras (nombre, moneda, saldo_actual, user_id, activa, es_fondo_prevision, es_compartida, icono, ultima_conciliacion_at, saldo_inicial_pendiente)
    VALUES (trim(p_cuenta_nombre), v_moneda_final, 0, v_user_id, true, false, false, COALESCE(p_cuenta_icono, '💳'), now(), COALESCE(p_cuenta_saldo_omitido, false))
    RETURNING billetera_id INTO v_cuenta_id;

    IF COALESCE(p_cuenta_saldo_omitido, false) = false AND v_cuenta_saldo_inicial > 0 THEN
      INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso, fecha, detalle)
      VALUES (v_user_id, 'opening', v_cuenta_id, v_cuenta_saldo_inicial, 0, CURRENT_DATE, 'initial_balance_account_creation');
    END IF;
  END IF;

  -- 2. Crear cuenta de Efectivo (Obligatorio)
  INSERT INTO public.p_billeteras (nombre, moneda, saldo_actual, user_id, activa, es_fondo_prevision, es_compartida, icono, ultima_conciliacion_at, saldo_inicial_pendiente)
  VALUES (trim(p_efectivo_nombre), v_moneda_final, 0, v_user_id, true, false, false, COALESCE(p_efectivo_icono, '💵'), now(), COALESCE(p_efectivo_saldo_omitido, false))
  RETURNING billetera_id INTO v_efectivo_id;

  IF COALESCE(p_efectivo_saldo_omitido, false) = false AND v_efectivo_saldo_inicial > 0 THEN
    INSERT INTO public.p_caja (user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso, fecha, detalle)
    VALUES (v_user_id, 'opening', v_efectivo_id, v_efectivo_saldo_inicial, 0, CURRENT_DATE, 'initial_balance_cash_creation');
  END IF;

  RETURN jsonb_build_object(
    'cuenta_billetera_id', v_cuenta_id,
    'efectivo_billetera_id', v_efectivo_id
  );
END;
$function$

