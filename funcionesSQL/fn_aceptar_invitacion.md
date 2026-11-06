CREATE OR REPLACE FUNCTION public.fn_aceptar_invitacion(p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_invitacion RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF EXISTS (SELECT 1 FROM p_hogar_participantes WHERE user_id = v_user_id) THEN 
        RAISE EXCEPTION '{"key": "error_home_already_member", "params": {}}';
    END IF;

    SELECT * INTO v_invitacion FROM p_hogar_invitaciones
    WHERE codigo = upper(p_codigo) AND usada = false AND expira_at > now();

    IF v_invitacion IS NULL THEN
        RAISE EXCEPTION '{"key": "error_invitation_invalid_or_expired", "params": {}}';
    END IF;

    IF v_invitacion.creado_por_user_id = v_user_id THEN
        RAISE EXCEPTION '{"key": "error_invitation_own_code", "params": {}}';
    END IF;

    INSERT INTO p_hogar_participantes (hogar_id, user_id, rol)
    VALUES (v_invitacion.hogar_id, v_user_id, 'invitado');

    UPDATE p_hogar_invitaciones
    SET usada = true, usada_por_user_id = v_user_id
    WHERE invitacion_id = v_invitacion.invitacion_id;

    RETURN jsonb_build_object(
        'hogar_id', v_invitacion.hogar_id,
        'success_key', 'success_home_joined',
        'params', '{}'::jsonb
    );
END;
$function$