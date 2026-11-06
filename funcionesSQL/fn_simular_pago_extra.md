CREATE OR REPLACE FUNCTION public.fn_simular_pago_extra(p_deuda_id bigint, p_monto_extra numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_saldo_actual numeric;
    v_tna numeric;
    v_cuota numeric;
    v_meses_restantes int;
    v_nuevos_meses int;
    v_ahorro_intereses numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT saldo_actual, tasa_anual_tna, cuota_mensual INTO v_saldo_actual, v_tna, v_cuota
    FROM p_prestamos WHERE prestamo_id = p_deuda_id AND user_id = v_user_id;

    IF v_saldo_actual IS NULL THEN RAISE EXCEPTION '{"key": "error_debt_not_found", "params": {}}'; END IF;
    IF p_monto_extra <= 0 THEN RAISE EXCEPTION '{"key": "error_extra_payment_zero", "params": {}}'; END IF;

    v_meses_restantes := CEIL(v_saldo_actual / NULLIF(v_cuota, 0));
    v_nuevos_meses := CEIL((v_saldo_actual - p_monto_extra) / NULLIF(v_cuota, 0));
    v_ahorro_intereses := (v_meses_restantes - v_nuevos_meses) * (v_cuota * (v_tna / 1200));

    RETURN jsonb_build_object(
        'meses_actuales', v_meses_restantes,
        'meses_con_pago_extra', GREATEST(0, v_nuevos_meses),
        'meses_ahorrados', v_meses_restantes - v_nuevos_meses,
        'ahorro_intereses_estimado', ROUND(GREATEST(0, v_ahorro_intereses), 2),
        'nuevo_saldo', ROUND(GREATEST(0, v_saldo_actual - p_monto_extra), 2)
    );
END;
$function$