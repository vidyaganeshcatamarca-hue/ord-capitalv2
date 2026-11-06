CREATE OR REPLACE FUNCTION public.fn_calcular_arrastre_deuda(p_mes_periodo date DEFAULT date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))
 RETURNS TABLE(estructura_id bigint, nombre_categoria text, deficit_mes_anterior numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_mes_anterior date := date_trunc('month', p_mes_periodo) - INTERVAL '1 month';
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    RETURN QUERY
    SELECT 
        p.estructura_egreso_id,
        e.nombre_cuenta::text,
        GREATEST(0, COALESCE(gm.total_gastado, 0) - p.monto_limite)::numeric
    FROM p_presupuestos p
    INNER JOIN p_estructuras_egresos e ON p.estructura_egreso_id = e.estructura_id
    LEFT JOIN (
        SELECT estructura_egreso_id, SUM(valor_egreso) as total_gastado
        FROM p_caja
        WHERE tipo = 'expense'
          AND date_trunc('month', fecha) = v_mes_anterior
          AND ((user_id = v_user_id AND es_compartido = false) 
               OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id AND es_compartido = true))
        GROUP BY estructura_egreso_id
    ) gm ON p.estructura_egreso_id = gm.estructura_egreso_id
    WHERE p.mes_periodo = v_mes_anterior
      AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
      AND COALESCE(gm.total_gastado, 0) > p.monto_limite
    ORDER BY (COALESCE(gm.total_gastado, 0) - p.monto_limite) DESC;
END;
$function$
