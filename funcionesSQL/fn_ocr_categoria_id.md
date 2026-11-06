CREATE OR REPLACE FUNCTION public.fn_ocr_categoria_id(p_user_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_id bigint;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT e.estructura_id INTO v_id
    FROM public.p_estructuras_egresos e
    WHERE e.user_id = p_user_id
      AND e.padre_id IS NULL
      AND e.nombre_cuenta = 'ocr_unrecognized'
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    -- Provision en el primer uso. El indice unico parcial convierte dos
    -- llamadas concurrentes en "una inserta, la otra reusa".
    INSERT INTO public.p_estructuras_egresos (
        user_id, padre_id, nombre_cuenta, descripcion, tipo_cupo, icono, color
    )
    VALUES (
        p_user_id, NULL, 'ocr_unrecognized',
        'sys_do_not_delete_ocr_fallback', 'need', 'ReceiptText', '#64748B'
    )
    ON CONFLICT (user_id) WHERE nombre_cuenta = 'ocr_unrecognized' AND padre_id IS NULL
    DO NOTHING
    RETURNING estructura_id INTO v_id;

    IF v_id IS NULL THEN
        SELECT e.estructura_id INTO v_id
        FROM public.p_estructuras_egresos e
        WHERE e.user_id = p_user_id
          AND e.padre_id IS NULL
          AND e.nombre_cuenta = 'ocr_unrecognized'
        LIMIT 1;
    END IF;

    IF v_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_ocr_system_category_missing", "params": {}}';
    END IF;

    RETURN v_id;
END;
$function$;
