CREATE OR REPLACE FUNCTION public.fn_crear_feedback(p_tipo text, p_mensaje text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
    v_feedback_id BIGINT;
BEGIN
    -- 1. Validar usuario
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Validar tipo
    IF p_tipo NOT IN ('bug', 'sugerencia', 'consulta') THEN
        RAISE EXCEPTION '{"key": "error_field_invalid", "params": {"field": "tipo"}}';
    END IF;

    -- 3. Validar mensaje mínimo
    IF LENGTH(COALESCE(p_mensaje, '')) < 10 THEN
        RAISE EXCEPTION '{"key": "error_field_out_of_range", "params": {"field": "mensaje", "min": 10, "max": 5000}}';
    END IF;

    -- 4. Insertar enriqueciendo metadata
    INSERT INTO public.p_feedback_usuario (
        user_id, tipo, mensaje, metadata
    ) VALUES (
        v_user_id,
        p_tipo,
        p_mensaje,
        p_metadata || jsonb_build_object(
            'registrado_at', now(),
            'user_id_ref', v_user_id
        )
    )
    RETURNING feedback_id INTO v_feedback_id;

    RETURN v_feedback_id;
END;
$function$