CREATE OR REPLACE FUNCTION public.fn_crear_ingreso_personalizado(p_nombre text, p_descripcion text, p_icono text, p_color text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_producto_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    INSERT INTO p_ingresos (nombre, descripcion, user_id, icono, color)
    VALUES (p_nombre, p_descripcion, v_user_id, p_icono, p_color)
    RETURNING producto_id INTO v_producto_id;
    
    RETURN v_producto_id;
END; $function$