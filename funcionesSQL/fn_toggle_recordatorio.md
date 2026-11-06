CREATE OR REPLACE FUNCTION public.fn_toggle_recordatorio(p_recordatorio_id bigint, p_activo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    UPDATE public.p_recordatorios SET activo = p_activo
    WHERE recordatorio_id = p_recordatorio_id AND user_id = v_user_id;
END;
$function$
