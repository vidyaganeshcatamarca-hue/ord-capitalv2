CREATE OR REPLACE FUNCTION public.fn_tr_proteger_categoria_ocr()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.nombre_cuenta IS DISTINCT FROM OLD.nombre_cuenta
       OR NEW.padre_id IS DISTINCT FROM OLD.padre_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION '{"key": "error_category_system_locked", "params": {}}';
    END IF;

    RETURN NEW;
END;
$function$;
