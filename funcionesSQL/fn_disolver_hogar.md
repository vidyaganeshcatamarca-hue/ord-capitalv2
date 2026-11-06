CREATE OR REPLACE FUNCTION public.fn_disolver_hogar()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    IF v_hogar_id IS NULL THEN 
        RAISE EXCEPTION '{"key": "error_home_no_active_home", "params": {}}'; 
    END IF;

    DELETE FROM p_hogar_participantes WHERE hogar_id = v_hogar_id;
    UPDATE p_hogares SET codigo_invitacion = NULL WHERE hogar_id = v_hogar_id;
END;
$function$