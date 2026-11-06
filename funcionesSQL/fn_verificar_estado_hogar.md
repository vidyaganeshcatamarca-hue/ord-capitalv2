CREATE OR REPLACE FUNCTION public.fn_verificar_estado_hogar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_rol text;
    v_total_participantes integer := 0;
    v_nombre_hogar text;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT hp.hogar_id, hp.rol, h.nombre_hogar
    INTO v_hogar_id, v_rol, v_nombre_hogar
    FROM public.p_hogar_participantes hp
    JOIN public.p_hogares h ON h.hogar_id = hp.hogar_id
    WHERE hp.user_id = v_user_id
    LIMIT 1;

    IF v_hogar_id IS NULL THEN
        RETURN jsonb_build_object(
            'tiene_hogar', false,
            'tiene_pareja', false,
            'hogar_id', null,
            'rol', null,
            'nombre_hogar', null
        );
    END IF;

    SELECT COUNT(*)
    INTO v_total_participantes
    FROM public.p_hogar_participantes
    WHERE hogar_id = v_hogar_id;

    RETURN jsonb_build_object(
        'tiene_hogar', true,
        'tiene_pareja', v_total_participantes >= 2,
        'hogar_id', v_hogar_id,
        'rol', v_rol,
        'nombre_hogar', v_nombre_hogar
    );
END;
$function$
