CREATE OR REPLACE FUNCTION public.fn_notificaciones_contar()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_total   integer;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT count(*)::integer INTO v_total
    FROM public.p_notificaciones_enviadas n
    WHERE n.user_id = v_user_id
      AND COALESCE(n.leida, false) = false
      AND n.familia = 'operativo'
      AND (n.expira_at IS NULL OR n.expira_at > now())
      AND (n.pausada_hasta IS NULL OR n.pausada_hasta < now());

    RETURN v_total;
END;
$function$
