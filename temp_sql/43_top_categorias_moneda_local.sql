-- Reportes del donut en moneda local (opcion B): suman valor_local congelado.
-- Los movimientos sin snapshot (cotizacion faltante) quedan excluidos del agregado
-- y reportados en meta.sin_cotizacion: nunca se inventa una tasa. Las builds viejas
-- de produccion ignoran la columna extra meta (shape superset, como patrimonio).
CREATE OR REPLACE FUNCTION public.fn_reporte_top_categorias_mes()
 RETURNS TABLE(nombre_categoria text, icono text, color text, total_consumido numeric, porcentaje_del_total numeric, meta jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_f_inicio date;
    v_f_fin date;
    v_moneda_local text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);

    SELECT COALESCE(r.moneda_default, 'ARS') INTO v_moneda_local
    FROM public.p_config_region r WHERE r.user_id = v_user_id;
    v_moneda_local := COALESCE(v_moneda_local, 'ARS');

    RETURN QUERY
    WITH movs AS (
        SELECT
            COALESCE(e.padre_id, e.estructura_id) as rubro_id,
            COALESCE(c.valor_local, 0) as valor_eff
        FROM public.p_caja c
        INNER JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.fecha BETWEEN v_f_inicio AND v_f_fin AND c.tipo = 'expense'
          AND ((c.user_id = v_user_id AND c.es_compartido = false)
               OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
    ), consumos AS (
        SELECT rubro_id, SUM(valor_eff) as total FROM movs GROUP BY rubro_id
    ), total_mes AS (
        SELECT COALESCE(SUM(valor_eff), 0) as t0,
               COUNT(*) FILTER (WHERE sin_cotizacion) as sin_cotizacion
        FROM movs
    )
    SELECT
        e.nombre_cuenta::text,
        e.icono::text,
        e.color::text,
        con.total::numeric,
        CASE WHEN tm.t0 > 0 THEN ROUND((con.total / tm.t0) * 100, 2) ELSE 0 END::numeric,
        jsonb_build_object('moneda_local', v_moneda_local, 'sin_cotizacion', tm.sin_cotizacion)::jsonb
    FROM consumos con
    CROSS JOIN total_mes tm
    INNER JOIN public.p_estructuras_egresos e ON con.rubro_id = e.estructura_id
    ORDER BY con.total DESC
    LIMIT 10;
END;
$function$;