CREATE OR REPLACE FUNCTION public.fn_marcar_todas_leidas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE public.p_notificaciones_enviadas
    SET leida = true, leida_at = now()
    WHERE user_id = v_user_id AND leida = false;
END;
$function$