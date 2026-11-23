CREATE OR REPLACE FUNCTION public.fn_historial_presupuesto(p_estructura_egreso_id bigint, p_mes_periodo date DEFAULT NULL::date)
 RETURNS TABLE(creado_at timestamp with time zone, monto_limite numeric, monto_techo numeric, motivo text, modo_origen text, modo_destino text)
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
    SELECT h.creado_at, h.monto_limite, h.monto_techo, h.motivo, h.modo_origen, h.modo_destino
      FROM public.p_presupuestos_historial h
     WHERE h.user_id = v_user_id
       AND h.estructura_egreso_id = p_estructura_egreso_id
       AND (p_mes_periodo IS NULL OR h.mes_periodo = date_trunc('month', p_mes_periodo)::date)
       AND (v_hogar_id IS NULL OR h.hogar_id IS NULL OR h.hogar_id = v_hogar_id)
     ORDER BY h.creado_at DESC
     LIMIT 50;
END;
$function$
