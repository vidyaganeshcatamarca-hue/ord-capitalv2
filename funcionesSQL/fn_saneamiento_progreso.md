CREATE OR REPLACE FUNCTION public.fn_saneamiento_progreso()
 RETURNS TABLE(moneda text, prestamos_activos integer, saldo_pendiente numeric, pagado_registrado numeric, porcentaje numeric, fecha_fin_estimada date, motivo_sin_fecha text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;

    RETURN QUERY
    WITH activos AS (
        SELECT trim(p.moneda_iso)::text AS moneda,
               p.saldo_actual,
               p.saldo_al_ingreso,
               p.monto_pagado_acumulado,
               p.modalidad,
               p.prestamo_id
        FROM public.p_prestamos p
        WHERE (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
          AND p.tipo_flujo = 'debo'
          AND p.estado IN ('activo', 'pendiente', 'parcial')
          AND p.eliminado_at IS NULL
    ),
    tot AS (
        SELECT a.moneda,
               count(*)::integer AS n,
               COALESCE(SUM(a.saldo_actual), 0) AS pendiente,
               COALESCE(SUM(a.monto_pagado_acumulado), 0) AS pagado,
               COALESCE(SUM(a.saldo_al_ingreso), 0) AS base,
               bool_and(a.modalidad = 'cuotas') AS todas_cronograma
        FROM activos a
        GROUP BY a.moneda
    ),
    ultima AS (
        SELECT trim(p.moneda_iso)::text AS moneda, MAX(c.fecha_vencimiento) AS fecha
        FROM public.p_prestamos_cuotas c
        JOIN public.p_prestamos p ON p.prestamo_id = c.prestamo_id
        WHERE (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
          AND p.tipo_flujo = 'debo'
          AND p.estado IN ('activo', 'pendiente', 'parcial')
          AND p.eliminado_at IS NULL
        GROUP BY trim(p.moneda_iso)
    )
    SELECT t.moneda, t.n, t.pendiente, t.pagado,
           CASE WHEN t.base > 0 THEN ROUND(t.pagado / t.base * 100, 2) ELSE NULL END,
           CASE WHEN t.todas_cronograma THEN u.fecha ELSE NULL END,
           CASE WHEN t.todas_cronograma THEN NULL ELSE 'no_todos_los_prestamos_tienen_cronograma' END
    FROM tot t
    LEFT JOIN ultima u ON u.moneda = t.moneda
    ORDER BY t.moneda;
END;
$function$
