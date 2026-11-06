CREATE OR REPLACE FUNCTION public.fn_actualizar_nombre_usuario(p_nombre text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
BEGIN
    -- 1. Validar usuario
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Validar nombre
    IF LENGTH(COALESCE(p_nombre, '')) < 2 OR LENGTH(p_nombre) > 50 THEN
        RAISE EXCEPTION '{"key": "error_field_out_of_range", "params": {"field": "nombre", "min": 2, "max": 50}}';
    END IF;

    -- 3. Actualizar
    UPDATE public.usuarios
    SET nombre = p_nombre
    WHERE user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_user_not_found", "params": {}}';
    END IF;
END;
$function$