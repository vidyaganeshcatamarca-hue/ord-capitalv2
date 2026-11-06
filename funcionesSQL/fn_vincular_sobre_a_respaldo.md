CREATE OR REPLACE FUNCTION public.fn_vincular_sobre_a_respaldo(p_sobre_id bigint, p_billetera_respaldo_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_es_sobre boolean;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT es_fondo_prevision INTO v_es_sobre
    FROM p_billeteras
    WHERE billetera_id = p_sobre_id AND user_id = v_user_id;

    IF v_es_sobre IS NULL OR v_es_sobre = false THEN
        RAISE EXCEPTION '{"key": "error_invalid_savings_envelope_id", "params": {}}';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM p_billeteras 
        WHERE billetera_id = p_billetera_respaldo_id AND user_id = v_user_id AND activa = true
    ) THEN
        RAISE EXCEPTION '{"key": "error_backup_wallet_invalid", "params": {}}';
    END IF;

    UPDATE p_billeteras
    SET billetera_respaldo_id = p_billetera_respaldo_id
    WHERE billetera_id = p_sobre_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_savings_fund_not_found", "params": {}}';
    END IF;
END;
$function$