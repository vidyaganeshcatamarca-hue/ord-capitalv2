CREATE OR REPLACE FUNCTION public.fn_rechazar_cuarentena(p_pendiente_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    DELETE FROM p_caja_cuarentena
    WHERE pendiente_id = p_pendiente_id AND user_id = v_user_id AND estado = 'pendiente';

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_quarantine_item_not_found", "params": {}}';
    END IF;
END;
$function$
