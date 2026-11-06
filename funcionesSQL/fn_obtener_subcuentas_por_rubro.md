CREATE OR REPLACE FUNCTION public.fn_obtener_subcuentas_por_rubro(p_rubro_id bigint)
 RETURNS TABLE(subcuenta_id bigint, nombre_subcuenta text, icono text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_hogar_id int8;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;

    RETURN QUERY
    SELECT DISTINCT e.estructura_id::int8, e.nombre_cuenta::text, e.icono::text
    FROM public.p_estructuras_egresos e
    WHERE e.padre_id = p_rubro_id
      AND (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.user_id IN (SELECT hp.user_id FROM public.p_hogar_participantes hp WHERE hp.hogar_id = v_hogar_id)))
    ORDER BY e.nombre_cuenta ASC;
END; $function$