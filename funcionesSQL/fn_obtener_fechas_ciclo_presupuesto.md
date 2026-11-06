CREATE OR REPLACE FUNCTION public.fn_obtener_fechas_ciclo_presupuesto(p_fecha_base date DEFAULT CURRENT_DATE)
 RETURNS TABLE(fecha_inicio date, fecha_fin date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_dia_ancla int2;
    v_inicio date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT dia_ancla_ciclo INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;
    IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;

    IF EXTRACT(DAY FROM p_fecha_base) >= v_dia_ancla THEN
        v_inicio := date_trunc('month', p_fecha_base) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    ELSE
        v_inicio := (date_trunc('month', p_fecha_base) - INTERVAL '1 month') + ((v_dia_ancla - 1) * INTERVAL '1 day');
    END IF;

    RETURN QUERY SELECT v_inicio::date, (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
END; $function$