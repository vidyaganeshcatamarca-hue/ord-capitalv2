CREATE OR REPLACE FUNCTION public.fn_actualizar_flexibilidad_subcuenta(p_subcuenta_id bigint, p_flexibilidad_recorte smallint)
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
    SET flexibilidad_recorte = p_flexibilidad_recorte 
    WHERE estructura_id = p_subcuenta_id AND user_id = v_user_id AND padre_id IS NOT NULL;
END; $function$