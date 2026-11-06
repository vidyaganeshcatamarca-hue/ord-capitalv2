CREATE OR REPLACE FUNCTION public.fn_asignar_dinero_a_presupuesto(p_billetera_id bigint, p_monto numeric, p_mes_periodo date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_saldo_billetera numeric;
    v_mes_truncado date := date_trunc('month', p_mes_periodo); 
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT saldo_actual INTO v_saldo_billetera
    FROM p_billeteras
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id AND activa = true AND es_fondo_prevision = false;

    IF NOT FOUND THEN 
        RAISE EXCEPTION '{"key": "error_budget_wallet_not_found", "params": {}}'; 
    END IF;

    IF v_saldo_billetera < p_monto THEN
        RAISE EXCEPTION '{"key": "error_budget_insufficient_wallet", "params": {}}';
    END IF;

    INSERT INTO p_inyecciones_presupuesto (user_id, billetera_origen_id, monto_inyectado, mes_periodo)
    VALUES (v_user_id, p_billetera_id, p_monto, v_mes_truncado);
END;
$function$