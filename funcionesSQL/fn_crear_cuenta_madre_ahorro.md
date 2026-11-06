CREATE OR REPLACE FUNCTION public.fn_crear_cuenta_madre_ahorro(p_nombre text, p_moneda text DEFAULT 'ARS'::text, p_saldo_apertura numeric DEFAULT 0, p_icono text DEFAULT '🏦'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_billetera_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    IF p_nombre IS NULL OR trim(p_nombre) = '' THEN RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "nombre"}}'; END IF;
    IF EXISTS (SELECT 1 FROM p_billeteras WHERE user_id = v_user_id AND es_cuenta_madre_ahorro = true AND activa = true) THEN
        RAISE EXCEPTION '{"key": "error_wallet_already_exists_as_mother", "params": {}}';
    END IF;

    INSERT INTO p_billeteras (nombre, moneda, saldo_actual, user_id, activa, es_fondo_prevision, es_compartida, es_cuenta_madre_ahorro, icono, ultima_conciliacion_at)
    VALUES (p_nombre, p_moneda, 0, v_user_id, true, false, false, true, p_icono, CURRENT_TIMESTAMP) RETURNING billetera_id INTO v_billetera_id;

    IF p_saldo_apertura > 0 THEN
        INSERT INTO p_caja (user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso, fecha, detalle)
        VALUES (v_user_id, 'opening', v_billetera_id, p_saldo_apertura, 0, CURRENT_DATE, 'initial_balance_mother_account');
    END IF;
    RETURN v_billetera_id;
END;
$function$