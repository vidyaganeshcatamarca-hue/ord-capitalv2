CREATE OR REPLACE FUNCTION public.fn_vincular_hogar_invitado(p_codigo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id int8;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogares WHERE codigo_invitacion = p_codigo;

    IF v_hogar_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_invitation_invalid_or_expired", "params": {}}';
    END IF;

    INSERT INTO p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_hogar_id, v_user_id, 'invitado');
    
    UPDATE p_hogares SET codigo_invitacion = NULL WHERE hogar_id = v_hogar_id;
END;
$function$