CREATE OR REPLACE FUNCTION public.fn_archivar_fondo_prevision(p_billetera_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_saldo numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT saldo_actual INTO v_saldo
    FROM p_billeteras
    WHERE billetera_id = p_billetera_id
      AND user_id = v_user_id
      AND es_fondo_prevision = true;

    IF v_saldo IS NULL THEN
        RAISE EXCEPTION '{"key": "error_savings_fund_not_found", "params": {}}';
    END IF;

    IF ABS(v_saldo) > 0.01 THEN
        RAISE EXCEPTION '{"key": "error_savings_fund_has_balance", "params": {}}';
    END IF;

    UPDATE public.p_billeteras
    SET activa = false,
        saldo_actual = 0
    WHERE billetera_id = p_billetera_id
      AND user_id = v_user_id;
END;
$function$
