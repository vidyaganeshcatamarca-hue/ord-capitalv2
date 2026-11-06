CREATE OR REPLACE FUNCTION public.fn_crear_proyecto_compartido(p_nombre text, p_presupuesto_meta numeric, p_fecha_objetivo date DEFAULT NULL::date, p_icono text DEFAULT '🎯'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_proyecto_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    IF v_hogar_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_home_must_be_couple", "params": {}}';
    END IF;

    IF p_presupuesto_meta <= 0 THEN
        RAISE EXCEPTION '{"key": "error_home_project_goal_zero", "params": {}}';
    END IF;

    INSERT INTO p_proyectos_compartidos (hogar_id, nombre_proyecto, presupuesto_meta, fecha_objetivo, icono, creado_por_user_id)
    VALUES (v_hogar_id, p_nombre, p_presupuesto_meta, p_fecha_objetivo, p_icono, v_user_id)
    RETURNING proyecto_id INTO v_proyecto_id;

    RETURN v_proyecto_id;
END;
$function$