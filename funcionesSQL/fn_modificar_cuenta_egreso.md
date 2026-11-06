CREATE OR REPLACE FUNCTION public.fn_modificar_cuenta_egreso(p_cuenta_id bigint, p_nombre text, p_descripcion text, p_tipo_cupo text, p_icono text, p_color text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE public.p_estructuras_egresos
    SET nombre_cuenta = p_nombre,
        descripcion = p_descripcion,
        tipo_cupo = p_tipo_cupo,
        icono = p_icono,
        color = p_color
    WHERE estructura_id = p_cuenta_id 
      AND user_id = v_user_id 
      AND padre_id IS NULL;

    IF NOT FOUND THEN 
        RAISE EXCEPTION '{"key": "error_category_edit_root_not_allowed", "params": {}}';
    END IF;
END; $function$