CREATE OR REPLACE FUNCTION public.fn_crear_cuenta_egreso(p_nombre text, p_descripcion text, p_tipo_cupo text, p_icono text, p_color text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint; 
    v_estructura_id bigint; 
    v_hogar_id int8;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    
    INSERT INTO public.p_estructuras_egresos (
        nombre_cuenta, descripcion, user_id, tipo_cupo, icono, color, hogar_id, padre_id
    )
    VALUES (
        p_nombre, p_descripcion, v_user_id, p_tipo_cupo, p_icono, p_color, v_hogar_id, NULL
    ) 
    RETURNING estructura_id INTO v_estructura_id;
    
    RETURN v_estructura_id;
END; $function$