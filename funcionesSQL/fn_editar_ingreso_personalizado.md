CREATE OR REPLACE FUNCTION public.fn_editar_ingreso_personalizado(
    p_producto_id bigint,
    p_nombre      text,
    p_descripcion text,
    p_icono       text,
    p_color       text,
    p_es_pasivo   boolean DEFAULT false
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    -- 1. Verificar identidad del usuario
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- 2. Validar que el nombre no esté vacío
    IF LENGTH(TRIM(COALESCE(p_nombre, ''))) < 1 THEN
        RAISE EXCEPTION '{"key": "error_field_required", "params": {"field": "nombre"}}';
    END IF;

    -- 3. Actualizar la fuente de ingreso (solo del usuario autenticado)
    UPDATE public.p_ingresos
    SET
        nombre      = TRIM(p_nombre),
        descripcion = COALESCE(TRIM(p_descripcion), descripcion),
        icono       = COALESCE(p_icono, icono),
        color       = COALESCE(p_color, color),
        es_pasivo   = COALESCE(p_es_pasivo, es_pasivo)
    WHERE producto_id = p_producto_id
      AND user_id = v_user_id;

    -- 4. Verificar que el registro existía y pertenecía al usuario
    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_income_source_not_found", "params": {}}';
    END IF;
END;
$function$
