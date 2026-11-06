CREATE OR REPLACE FUNCTION public.fn_reporte_gastos_fijos_mensuales()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_dia_ancla int2;
    v_gastos_detectados jsonb := '[]'::jsonb;
    v_total_fijos numeric := 0;
    r_categoria RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    SELECT COALESCE(dia_ancla_ciclo, 1) INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;

    FOR r_categoria IN 
        WITH gastos_mensuales AS (
            SELECT 
                e.estructura_id,
                e.nombre_cuenta,
                e.icono,
                e.color,
                date_trunc('month', 
                    (CASE 
                        WHEN EXTRACT(DAY FROM c.fecha) >= v_dia_ancla THEN date_trunc('month', c.fecha) + ((v_dia_ancla - 1) * INTERVAL '1 day')
                        ELSE (date_trunc('month', c.fecha) - INTERVAL '1 month') + ((v_dia_ancla - 1) * INTERVAL '1 day')
                    END) + INTERVAL '1 month' - INTERVAL '1 day'
                )::date AS mes,
                SUM(c.valor_egreso) AS total_mes
            FROM p_caja c
            INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
            WHERE c.user_id = v_user_id
              AND c.tipo = 'expense'
              AND c.fecha >= CURRENT_DATE - INTERVAL '6 months'
              AND (e.padre_id IS NOT NULL OR NOT EXISTS (
                  SELECT 1 FROM p_estructuras_egresos h WHERE h.padre_id = e.estructura_id
              ))
            GROUP BY e.estructura_id, e.nombre_cuenta, e.icono, e.color, mes
        ),
        categorias_recurrentes AS (
            SELECT 
                estructura_id,
                nombre_cuenta,
                icono,
                color,
                COUNT(DISTINCT mes) AS meses_con_gasto,
                AVG(total_mes) AS promedio_mensual,
                MAX(total_mes) AS maximo_mensual,
                MIN(total_mes) AS minimo_mensual
            FROM gastos_mensuales
            GROUP BY estructura_id, nombre_cuenta, icono, color
            HAVING COUNT(DISTINCT mes) >= 3
        )
        SELECT * FROM categorias_recurrentes
        ORDER BY promedio_mensual DESC
    LOOP
        v_gastos_detectados := v_gastos_detectados || jsonb_build_object(
            'estructura_id', r_categoria.estructura_id,
            'nombre', r_categoria.nombre_cuenta,
            'icono', r_categoria.icono,
            'color', r_categoria.color,
            'promedio_mensual', ROUND(r_categoria.promedio_mensual, 2),
            'maximo_mensual', ROUND(r_categoria.maximo_mensual, 2),
            'minimo_mensual', ROUND(r_categoria.minimo_mensual, 2),
            'meses_detectado', r_categoria.meses_con_gasto,
            'es_fijo_confirmado', false
        );
        
        v_total_fijos := v_total_fijos + r_categoria.promedio_mensual;
    END LOOP;

    RETURN jsonb_build_object(
        'gastos_detectados', v_gastos_detectados,
        'total_estimado_fijos', ROUND(v_total_fijos, 2),
        'cantidad_detectados', jsonb_array_length(v_gastos_detectados)
    );
END;
$function$