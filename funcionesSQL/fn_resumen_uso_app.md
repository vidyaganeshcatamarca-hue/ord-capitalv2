CREATE OR REPLACE FUNCTION public.fn_resumen_uso_app(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS TABLE(fecha date, total_sesiones bigint, total_segundos bigint, sesiones_completadas bigint, sesiones_crashed bigint, promedio_segundos double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    RETURN QUERY
    SELECT
        s.started_at::DATE AS fecha,
        COUNT(*) AS total_sesiones,
        COALESCE(SUM(s.total_active_seconds), 0) AS total_segundos,
        COUNT(*) FILTER (WHERE s.status = 'completed') AS sesiones_completadas,
        COUNT(*) FILTER (WHERE s.status IN ('posible_crash', 'crashed')) AS sesiones_crashed,
        COALESCE(AVG(s.total_active_seconds) FILTER (WHERE s.total_active_seconds > 0), 0)::double precision AS promedio_segundos
    FROM p_app_sessions s
    WHERE s.user_id = v_user_id
      AND (p_desde IS NULL OR s.started_at >= p_desde::TIMESTAMPTZ)
      AND (p_hasta IS NULL OR s.started_at < (p_hasta + INTERVAL '1 day')::TIMESTAMPTZ)
    GROUP BY s.started_at::DATE
    ORDER BY fecha DESC;
END;
$function$;
DECLARE
    v_user_id BIGINT;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    RETURN QUERY
    SELECT
        s.started_at::DATE AS fecha,
        COUNT(*) AS total_sesiones,
        COALESCE(SUM(s.total_active_seconds), 0) AS total_segundos,
        COUNT(*) FILTER (WHERE s.status = 'completed') AS sesiones_completadas,
        COUNT(*) FILTER (WHERE s.status = 'crashed') AS sesiones_crashed,
        COALESCE(AVG(s.total_active_seconds) FILTER (WHERE s.total_active_seconds > 0), 0) AS promedio_segundos
    FROM p_app_sessions s
    WHERE s.user_id = v_user_id
      AND (p_desde IS NULL OR s.started_at >= p_desde::TIMESTAMPTZ)
      AND (p_hasta IS NULL OR s.started_at < (p_hasta + INTERVAL '1 day')::TIMESTAMPTZ)
    GROUP BY s.started_at::DATE
    ORDER BY fecha DESC;
END;
$function$;
