CREATE OR REPLACE FUNCTION public.fn_reporte_fugas_silenciosas()
 RETURNS TABLE(estructura_id bigint, nombre_cuenta text, icono text, color text, frecuencia_mensual numeric, gasto_mensual_estimado numeric, impacto_anual numeric, porcentaje_del_ingreso numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_ingreso_anual_estimado numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(SUM(valor_ingreso), 0) * 4 INTO v_ingreso_anual_estimado
    FROM p_caja
    WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days';

    RETURN QUERY
    WITH gastos_90d AS (
        SELECT 
            e.estructura_id,
            e.nombre_cuenta,
            e.icono,
            COALESCE(e.color, padre.color) as color_final,
            COUNT(c.p_caja_id) as transacciones,
            SUM(c.valor_egreso) as total_90d
        FROM p_caja c
        INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        LEFT JOIN p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
        WHERE c.user_id = v_user_id 
          AND c.tipo = 'expense' 
          AND c.fecha >= CURRENT_DATE - INTERVAL '90 days'
          AND (e.tipo_cupo = 'want' OR e.es_hormiga = true)
          AND (e.padre_id IS NOT NULL OR NOT EXISTS (
              SELECT 1 FROM p_estructuras_egresos h WHERE h.padre_id = e.estructura_id
          ))
        GROUP BY e.estructura_id, e.nombre_cuenta, e.icono, e.color, padre.color
        HAVING COUNT(c.p_caja_id) >= 3
    )
    SELECT 
        g.estructura_id,
        g.nombre_cuenta,
        g.icono,
        g.color_final,
        ROUND((g.transacciones / 3.0), 1) as frec_mensual,
        ROUND((g.total_90d / 3.0), 2) as gasto_mensual,
        ROUND(g.total_90d * 4, 2) as impacto_anual,
        CASE 
            WHEN v_ingreso_anual_estimado > 0 THEN ROUND(((g.total_90d * 4) / v_ingreso_anual_estimado) * 100, 2)
            ELSE 0 
        END as pct_ingreso
    FROM gastos_90d g
    ORDER BY impacto_anual DESC
    LIMIT 10;
END;
$function$
