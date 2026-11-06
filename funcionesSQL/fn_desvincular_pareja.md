CREATE OR REPLACE FUNCTION public.fn_desvincular_pareja()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id AND rol = 'creador';

    IF v_hogar_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_home_only_creator_dissolve", "params": {}}';
    END IF;

    INSERT INTO p_hogar_conciliaciones (hogar_id, creado_por_user_id, tipo, monto_saldado, direccion, nota)
    VALUES (v_hogar_id, v_user_id, 'disolucion', 0, 'ninguna', 'Disolución del hogar');

    DELETE FROM p_hogar_participantes WHERE hogar_id = v_hogar_id AND rol = 'invitado';

    RETURN jsonb_build_object(
        'success_key', 'success_home_dissolved',
        'params', '{}'::jsonb
    );
END;
$function$