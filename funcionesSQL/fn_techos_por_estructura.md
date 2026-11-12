CREATE OR REPLACE FUNCTION public.fn_techos_por_estructura(p_mes date)
 RETURNS TABLE(estructura_id bigint, monto_techo numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_mes_truncado date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    v_mes_truncado := date_trunc('month', p_mes)::date;

    RETURN QUERY
    SELECT pr.estructura_egreso_id, pr.monto_techo
      FROM public.p_presupuestos pr
     WHERE pr.mes_periodo = v_mes_truncado
       AND (pr.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND pr.hogar_id = v_hogar_id))
     ORDER BY pr.estructura_egreso_id;
END;
$function$
