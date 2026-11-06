CREATE OR REPLACE FUNCTION public.fn_actualizar_calificacion_bcg(p_estructura_id bigint, p_placer smallint, p_flexibilidad smallint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF p_placer < 0 OR p_placer > 10 THEN
        RAISE EXCEPTION '{"key": "error_field_out_of_range", "params": {"field": "placer", "min": 0, "max": 10}}';
    END IF;

    IF p_flexibilidad < 0 OR p_flexibilidad > 10 THEN
        RAISE EXCEPTION '{"key": "error_field_out_of_range", "params": {"field": "flexibilidad", "min": 0, "max": 10}}';
    END IF;

    UPDATE public.p_estructuras_egresos
    SET utilidad_placer = p_placer, flexibilidad_recorte = p_flexibilidad
    WHERE estructura_id = p_estructura_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_category_not_found", "params": {}}';
    END IF;
END;
$function$