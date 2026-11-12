CREATE OR REPLACE FUNCTION public.fn_disponibles_transferibles(p_mes date)
 RETURNS TABLE(estructura_id bigint, disponible numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    RETURN QUERY
    SELECT e.estructura_id, public.fn_disponible_transferible(e.estructura_id, p_mes)
      FROM public.p_estructuras_egresos e
     WHERE e.user_id = v_user_id
        OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id)
     ORDER BY e.estructura_id;
END;
$function$
