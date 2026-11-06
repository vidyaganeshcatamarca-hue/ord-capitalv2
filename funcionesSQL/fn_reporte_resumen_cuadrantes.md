CREATE OR REPLACE FUNCTION public.fn_reporte_resumen_cuadrantes()
 RETURNS TABLE(cuadrante_key text, cantidad_subcuentas bigint, monto_total numeric, top_subcuentas jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_f_inicio date; v_f_fin date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto();

    RETURN QUERY
    WITH datos_bcg AS (
        SELECT e.estructura_id, e.nombre_cuenta, e.icono, COUNT(c.p_caja_id)::bigint AS frecuencia,
               COALESCE(e.utilidad_placer, 5)::smallint AS placer, COALESCE(e.flexibilidad_recorte, 5)::smallint AS flexibilidad,
               SUM(c.valor_egreso)::numeric AS monto_total,
               CASE 
                   WHEN COUNT(c.p_caja_id) > 4 AND COALESCE(e.utilidad_placer, 5) > 5 THEN 'star'
                   WHEN COUNT(c.p_caja_id) <= 4 AND COALESCE(e.utilidad_placer, 5) > 5 THEN 'cow'
                   WHEN COUNT(c.p_caja_id) <= 4 AND COALESCE(e.utilidad_placer, 5) <= 5 THEN 'dilemma'
                   ELSE 'dog'
               END AS cuadrante_key
        FROM p_caja c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha BETWEEN v_f_inicio AND v_f_fin
          AND ((e.padre_id IS NOT NULL) OR (e.padre_id IS NULL AND NOT EXISTS (SELECT 1 FROM p_estructuras_egresos hijo WHERE hijo.padre_id = e.estructura_id AND hijo.user_id = e.user_id)))
        GROUP BY e.estructura_id, e.nombre_cuenta, e.icono, e.utilidad_placer, e.flexibilidad_recorte
    )
    SELECT d.cuadrante_key, COUNT(*)::bigint AS cantidad, COALESCE(SUM(d.monto_total), 0)::numeric AS monto_acumulado,
           COALESCE(jsonb_agg(jsonb_build_object('nombre', d.nombre_cuenta, 'icono', d.icono, 'monto', d.monto_total) ORDER BY d.monto_total DESC) FILTER (WHERE d.monto_total IS NOT NULL), '[]'::jsonb) AS top_3
    FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY cuadrante_key ORDER BY monto_total DESC) as rn FROM datos_bcg) d
    WHERE d.rn <= 3 GROUP BY d.cuadrante_key
    ORDER BY CASE d.cuadrante_key WHEN 'dog' THEN 1 WHEN 'star' THEN 2 WHEN 'dilemma' THEN 3 WHEN 'cow' THEN 4 END;
END;
$function$
