CREATE OR REPLACE FUNCTION public.fn_ciclo_esta_cerrado(p_mes date)
 RETURNS boolean
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
    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;

    RETURN EXISTS (SELECT 1 FROM public.p_presupuestos_cierre c
                    WHERE c.tipo = 'ciclo'
                      AND c.mes_periodo = date_trunc('month', p_mes)::date
                      AND COALESCE(c.user_id, 0) = v_user_id
                      AND COALESCE(c.hogar_id, 0) = COALESCE(v_hogar_id, 0));
END;
$function$
