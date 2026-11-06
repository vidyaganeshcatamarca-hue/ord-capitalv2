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
    v_moneda_final := COALESCE(p_moneda, v_moneda_local);

        IF v_moneda_local IS NULL THEN
      RAISE EXCEPTION '{"key": "error_region_not_configured", "params": {}}';
    ELSIF v_moneda_final <> 'USD' AND v_moneda_final <> v_moneda_local THEN
      RAISE EXCEPTION '{"key": "error_currency_not_local", "params": {}}';
    END IF;

    INSERT INTO p_billeteras (nombre, moneda, saldo_actual, user_id, activa, es_fondo_prevision, es_compartida, icono, ultima_conciliacion_at)
    VALUES (p_nombre, v_moneda_final, 0, v_user_id, true, false, false, p_icono, CURRENT_TIMESTAMP) RETURNING billetera_id INTO v_billetera_id;

    IF p_saldo_apertura > 0 THEN
        INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso, fecha, detalle)
        VALUES (v_user_id, 'opening', v_billetera_id, p_saldo_apertura, 0, COALESCE(p_fecha_apertura, CURRENT_DATE), 'initial_balance');
    END IF;
    RETURN v_billetera_id;
END;
$function$

