CREATE OR REPLACE FUNCTION public.fn_eliminar_gasto_recurrente(p_recurrente_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE p_gastos_recurrentes SET activo = false
    WHERE recurrente_id = p_recurrente_id AND user_id = v_user_id;

    IF NOT FOUND THEN RAISE EXCEPTION '{"key": "error_recurrent_not_found", "params": {}}'; END IF;
END;
$function$