CREATE OR REPLACE FUNCTION public.fn_reporte_cartera_inversiones()
 RETURNS TABLE(
    inversion_id bigint,
    nombre_activo text,
    tipo_activo text,
    monto_invertido_original numeric,
    valor_actual_teorico numeric,
    rendimiento_nominal numeric,
    rendimiento_real numeric,
    dias_desde_conciliacion integer,
    estado_semaforo_key text,
    estado_inversion text,
    tasa_anual_tna numeric,
    moneda text,
    fecha_inicio date,
    ultima_conciliacion date
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    RETURN QUERY
    SELECT
        i.inversion_id,
        i.nombre_activo,
        CASE
            WHEN i.tasa_anual_tna > 0 THEN 'plazo_fijo'::text
            ELSE 'variable'::text
        END AS tipo_activo,
        i.monto_invertido_original,
        CASE
            WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
            WHEN i.tasa_anual_tna > 0 THEN
                i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
            ELSE i.monto_invertido_original
        END::numeric AS valor_actual_teorico,
        CASE
            WHEN i.monto_invertido_original > 0 THEN
                ROUND(
                    (((CASE
                        WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
                        WHEN i.tasa_anual_tna > 0 THEN
                            i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
                        ELSE i.monto_invertido_original
                    END) - i.monto_invertido_original) / i.monto_invertido_original) * 100, 2)
            ELSE 0
        END::numeric AS rendimiento_nominal,
        NULL::numeric AS rendimiento_real,
        (CURRENT_DATE - i.ultima_conciliacion)::int AS dias_desde_conciliacion,
        CASE
            WHEN (CURRENT_DATE - i.ultima_conciliacion) <= 30 THEN 'green'::text
            WHEN (CURRENT_DATE - i.ultima_conciliacion) <= 45 THEN 'yellow'::text
            ELSE 'red'::text
        END AS estado_semaforo_key,
        i.estado AS estado_inversion,
        i.tasa_anual_tna,
        COALESCE(i.moneda, 'ARS') AS moneda,
        i.fecha_inicio,
        i.ultima_conciliacion
    FROM p_inversiones i
    WHERE i.user_id = v_user_id
    ORDER BY
        CASE
            WHEN i.valor_mercado_actual IS NOT NULL THEN i.valor_mercado_actual
            WHEN i.tasa_anual_tna > 0 THEN
                i.monto_invertido_original + (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
            ELSE i.monto_invertido_original
        END DESC;
END;
$function$
