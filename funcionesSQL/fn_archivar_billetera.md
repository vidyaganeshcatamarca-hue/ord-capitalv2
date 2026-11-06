CREATE OR REPLACE FUNCTION public.fn_archivar_billetera(p_billetera_id bigint)
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

    SELECT saldo_actual INTO v_saldo FROM p_billeteras 
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id;

    IF v_saldo IS DISTINCT FROM 0 AND v_saldo IS NOT NULL THEN
        RAISE EXCEPTION '{"key": "error_wallet_has_balance", "params": {}}';
    END IF;

    UPDATE p_billeteras SET activa = false
    WHERE billetera_id = p_billetera_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_wallet_not_found", "params": {}}';
    END IF;
END;
$function$