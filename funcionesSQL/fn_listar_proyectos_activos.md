CREATE OR REPLACE FUNCTION public.fn_listar_proyectos_activos()
 RETURNS TABLE(proyecto_id bigint, nombre_proyecto text, presupuesto_meta numeric, creado_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT hogar_id INTO v_hogar_id
    FROM public.p_hogar_participantes
    WHERE user_id = v_user_id
    LIMIT 1;

    IF v_hogar_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        pc.proyecto_id,
        pc.nombre_proyecto,
        pc.presupuesto_meta,
        pc.creado_at
    FROM public.p_proyectos_compartidos pc
    WHERE pc.hogar_id = v_hogar_id
    ORDER BY pc.creado_at DESC, pc.proyecto_id DESC;
END;
$function$
