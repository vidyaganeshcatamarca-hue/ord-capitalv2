CREATE OR REPLACE FUNCTION public.fn_reporte_calendario_financiero(p_dias_adelante integer DEFAULT 30)
 RETURNS TABLE(evento_id text, tipo_evento text, fecha date, nombre text, monto numeric, criticidad text, pagado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_moneda_local text;
    v_cot numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS')
      INTO v_moneda_local;
    SELECT (SELECT d.valor_por_usd FROM public.p_divisas d WHERE d.nombre = v_moneda_local
             ORDER BY ultima_actualizacion DESC LIMIT 1)
      INTO v_cot;

    RETURN QUERY
    SELECT
        e.evento_id, e.tipo_evento, e.fecha, e.nombre, e.monto,
        CASE WHEN e.fecha <= CURRENT_DATE + 3 THEN 'critico'::text
             WHEN e.fecha <= CURRENT_DATE + 10 THEN 'atencion'::text
             ELSE 'normal'::text END AS criticidad,
        e.pagado
    FROM (
        -- Cuotas de prestamos
        SELECT
            ('prestamo_' || cd.cuota_id)::text AS evento_id,
            'cuota_prestamo'::text AS tipo_evento,
            cd.fecha_estimada_pago AS fecha,
            p.nombre_prestamo::text AS nombre,
            cd.monto_cuota AS monto,
            cd.pagado
        FROM public.p_cuotas_detalle cd
        JOIN public.p_prestamos p ON cd.prestamo_id = p.prestamo_id
        WHERE cd.user_id = v_user_id
          AND cd.fecha_estimada_pago BETWEEN CURRENT_DATE AND CURRENT_DATE + (p_dias_adelante || ' days')::interval

        UNION ALL

        -- Vencimientos de tarjetas: el importe es el RESUMEN REAL (las cuotas
        -- impagas del ciclo que vence ese dia), no los compromisos del mes. Es
        -- la misma fuente que usa la pantalla de Tarjetas, para que las dos
        -- pantallas digan el mismo numero.
        SELECT
            ('tarjeta_' || t.tarjeta_id || '_' || to_char(v.fecha, 'YYYYMM'))::text AS evento_id,
            'vencimiento_tarjeta'::text AS tipo_evento,
            v.fecha,
            t.nombre_tarjeta::text AS nombre,
            COALESCE((
                SELECT COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN 0 ELSE cd.monto_cuota END), 0)
                     + COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0) * COALESCE(v_cot, 0)
                FROM public.p_cuotas_detalle cd
                WHERE cd.tarjeta_id = t.tarjeta_id
                  AND cd.pagado = false
                  AND cd.fecha_estimada_pago BETWEEN date_trunc('month', v.fecha)::date AND v.fecha
            ), 0) AS monto,
            false AS pagado
        FROM public.p_tarjetas_credito t
        CROSS JOIN LATERAL (
            SELECT CASE
                     WHEN EXTRACT(DAY FROM CURRENT_DATE) <= t.dia_vencimiento
                     THEN (date_trunc('month', CURRENT_DATE) + ((t.dia_vencimiento - 1) || ' days')::interval)::date
                     ELSE (date_trunc('month', CURRENT_DATE + INTERVAL '1 month') + ((t.dia_vencimiento - 1) || ' days')::interval)::date
                   END AS fecha
        ) v
        WHERE t.user_id = v_user_id
          AND t.activa = true
          AND t.dia_vencimiento IS NOT NULL

        UNION ALL

        -- Gastos recurrentes — TRES MODOS, con recorte al último día del mes
        -- Requisitos: R-GR-22, R-GR-25, R-GR-42, D-18, RN-36 (PRD §33 producto 5 y 6)
        --
        -- Qué cambia respecto de la versión desplegada:
        --   1. `dia_del_mes = 31` en un mes de 30 días se desbordaba al mes siguiente
        --      (31 de abril -> 1 de mayo). Ahora se recorta con LEAST(dia, último_día).
        --   2. Solo proyectaba una fecha por mes y solo modo mensual. Ahora proyecta
        --      las fechas del horizonte para semanal, mensual y anual.
        --   3. El nombre caía en el literal español 'Gasto recurrente', que viola la
        --      regla 9 del AGENTS.md. Ahora usa el rubro y, si no hay, devuelve NULL
        --      para que el frontend resuelva la clave i18n.
        --   4. `evento_id` incluye la fecha: un recurrente puede tener varias
        --      ocurrencias en el mismo horizonte y el id tiene que ser único.
        --
        -- El UNION (no UNION ALL) deduplica: elegir 30 y 31 en febrero produce UNA
        -- sola fecha el día 28, que es lo que pide RN-36.
        SELECT
            ('recurrente_' || gr.recurrente_id || '_' || f.fecha)::text AS evento_id,
            'gasto_recurrente'::text AS tipo_evento,
            f.fecha,
            COALESCE(gr.nombre_custom, est.nombre_cuenta)::text AS nombre,
            COALESCE(gr.monto_base, 0) AS monto,
            false AS pagado
        FROM public.p_gastos_recurrentes gr
        LEFT JOIN public.p_estructuras_egresos est ON gr.estructura_egreso_id = est.estructura_id
        CROSS JOIN LATERAL (
            SELECT v.fecha
              FROM (
                    -- semanal: coincide el día de la semana
                    SELECT d::date AS fecha
                      FROM generate_series(CURRENT_DATE,
                                            CURRENT_DATE + p_dias_adelante,
                                            INTERVAL '1 day') AS d
                     WHERE gr.modo = 'semanal'
                       AND EXTRACT(ISODOW FROM d)::int = ANY (COALESCE(gr.dias_semana, '{}'::smallint[]))

                    UNION

                    -- mensual: cada día elegido, recortado al último del mes
                    SELECT (date_trunc('month', d)
                            + ((LEAST(dia.valor::int,
                                      EXTRACT(DAY FROM (date_trunc('month', d)
                                                        + INTERVAL '1 month' - INTERVAL '1 day'))::int
                                     ) - 1) || ' days')::interval)::date AS fecha
                      FROM generate_series(CURRENT_DATE,
                                            CURRENT_DATE + p_dias_adelante,
                                            INTERVAL '1 day') AS d
                     CROSS JOIN LATERAL unnest(
                               COALESCE(gr.dias_mes, ARRAY[gr.dia_del_mes]::smallint[])) AS dia(valor)
                     WHERE gr.modo = 'mensual'

                    UNION

                    -- anual: mes*100+día, con el 29/02 recortado al 28 en año no bisiesto
                    SELECT make_date(
                             EXTRACT(YEAR FROM d)::int,
                             (f.valor / 100)::int,
                             LEAST((f.valor % 100)::int,
                                   EXTRACT(DAY FROM (make_date(EXTRACT(YEAR FROM d)::int,
                                                               (f.valor / 100)::int, 1)
                                                     + INTERVAL '1 month' - INTERVAL '1 day'))::int)
                           )::date AS fecha
                      FROM generate_series(CURRENT_DATE,
                                            CURRENT_DATE + p_dias_adelante,
                                            INTERVAL '1 day') AS d
                     CROSS JOIN LATERAL unnest(
                               COALESCE(gr.fechas_anio, '{}'::smallint[])) AS f(valor)
                     WHERE gr.modo = 'anual'
              ) AS v
             WHERE v.fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + p_dias_adelante
        ) AS f
        WHERE gr.user_id = v_user_id
          AND gr.activo = true
    ) AS e
    ORDER BY e.fecha ASC, e.monto DESC;
END;
$function$
