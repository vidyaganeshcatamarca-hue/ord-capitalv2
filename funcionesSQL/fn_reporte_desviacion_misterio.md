CREATE OR REPLACE FUNCTION public.fn_reporte_desviacion_misterio()
 RETURNS TABLE(olvidos_pesos numeric, olvidos_dolares numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint; 
    v_hogar_id bigint;
    v_f_inicio date;
    v_f_fin date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF; 
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);

    RETURN QUERY
    SELECT 
        COALESCE(SUM(CASE WHEN b.moneda = 'ARS' THEN c.valor_egreso ELSE 0 END), 0) AS olvidos_pesos,
        COALESCE(SUM(CASE WHEN b.moneda = 'USD' THEN c.valor_egreso ELSE 0 END), 0) AS olvidos_dolares
    FROM p_caja c
    INNER JOIN p_billeteras b ON c.billetera_origen_id = b.billetera_id
    WHERE c.user_id = v_user_id AND c.tipo = 'adjustment' AND c.valor_egreso > 0 AND c.fecha >= v_f_inicio AND c.fecha <= v_f_fin;
END; $function$
