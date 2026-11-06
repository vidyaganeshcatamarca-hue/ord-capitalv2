CREATE OR REPLACE FUNCTION public.fn_reporte_distribucion_activos()
 RETURNS TABLE(
    tipo_activo text,
    cantidad integer,
    valor_total numeric,
    porcentaje_valor numeric
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_total_general numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
            WHEN i.tasa_anual_tna > 0 THEN
                i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
            ELSE i.monto_invertido_original
        END
    ), 0) INTO v_total_general
    FROM p_inversiones i
    WHERE i.user_id = v_user_id AND i.estado = 'activa';

    RETURN QUERY
    SELECT
        CASE WHEN i.tasa_anual_tna > 0 THEN 'plazo_fijo'::text ELSE 'variable'::text END AS tipo_activo,
        COUNT(*)::int AS cantidad,
        COALESCE(SUM(
            CASE
                WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                WHEN i.tasa_anual_tna > 0 THEN
                    i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                ELSE i.monto_invertido_original
            END
        ), 0)::numeric AS valor_total,
        CASE
            WHEN v_total_general > 0
            THEN ROUND((SUM(
                CASE
                    WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                    WHEN i.tasa_anual_tna > 0 THEN
                        i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                    ELSE i.monto_invertido_original
                END
            ) / v_total_general) * 100, 2)
            ELSE 0
        END::numeric AS porcentaje_valor
    FROM p_inversiones i
    WHERE i.user_id = v_user_id AND i.estado = 'activa'
    GROUP BY (CASE WHEN i.tasa_anual_tna > 0 THEN 'plazo_fijo' ELSE 'variable' END)
    ORDER BY valor_total DESC;
END;
$function$
