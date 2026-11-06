CREATE OR REPLACE FUNCTION public.fn_reporte_presupuestos_mensuales()
 RETURNS TABLE(nombre_categoria text, monto_limite numeric, monto_consumido numeric, porcentaje_alerta numeric, icono text, color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_hogar_id int8; v_f_inicio date; v_f_fin date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto();
    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;

    RETURN QUERY
    WITH consumos AS (
        SELECT 
            COALESCE(e.padre_id, e.estructura_id) as rubro_id,
            SUM(c.valor_egreso) as total_consumido
        FROM public.p_caja c
        INNER JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.fecha BETWEEN v_f_inicio AND v_f_fin AND c.tipo = 'expense'
          AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
        GROUP BY COALESCE(e.padre_id, e.estructura_id)
    )
    SELECT 
        e.nombre_cuenta::text,
        p.monto_limite::numeric,
        COALESCE(con.total_consumido, 0)::numeric,
        CASE WHEN p.monto_limite = 0 THEN 0::numeric ELSE ROUND((COALESCE(con.total_consumido, 0) / p.monto_limite) * 100, 2)::numeric END,
        e.icono::text, e.color::text
    FROM public.p_presupuestos p
    INNER JOIN public.p_estructuras_egresos e ON p.estructura_egreso_id = e.estructura_id
    LEFT JOIN consumos con ON con.rubro_id = e.estructura_id
    WHERE p.mes_periodo = v_f_inicio
      AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id));
END;
$function$
