CREATE OR REPLACE FUNCTION public.fn_eliminar_estructura_egreso(p_estructura_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint;
    v_es_padre boolean;
    v_count integer;
    v_es_sistema_ocr boolean;
BEGIN
    -- Validar identidad
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- OCR: la categoria fallback del sistema no se elimina a mano (PRD §8).
    SELECT EXISTS (
        SELECT 1 FROM public.p_estructuras_egresos
        WHERE estructura_id = p_estructura_id
          AND user_id = v_user_id
          AND nombre_cuenta = 'ocr_unrecognized'
          AND padre_id IS NULL
    ) INTO v_es_sistema_ocr;
    IF v_es_sistema_ocr THEN
        RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
    END IF;

    -- Verificar que no se intente borrar un rubro padre si todavía tiene subcuentas adentro
    SELECT EXISTS (SELECT 1 FROM p_estructuras_egresos WHERE padre_id = p_estructura_id AND user_id = v_user_id) INTO v_es_padre;
    IF v_es_padre THEN
        RAISE EXCEPTION '{"key": "error_category_has_children", "params": {}}';
    END IF;

    -- Verificar que no se intente borrar si ya hay movimientos de la billetera utilizando esta categoría
    SELECT count(*) INTO v_count FROM p_caja WHERE estructura_egreso_id = p_estructura_id;
    IF v_count > 0 THEN
        RAISE EXCEPTION '{"key": "error_category_in_use", "params": {}}';
    END IF;

    -- Eliminar la categoría
    DELETE FROM p_estructuras_egresos 
    WHERE estructura_id = p_estructura_id AND user_id = v_user_id;
    
    IF NOT FOUND THEN 
        RAISE EXCEPTION '{"key": "error_category_not_found", "params": {}}'; 
    END IF;
END;
$function$;
