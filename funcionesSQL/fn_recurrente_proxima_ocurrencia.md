CREATE OR REPLACE FUNCTION public.fn_recurrente_proxima_ocurrencia(p_modo text, p_dias_semana smallint[] DEFAULT NULL::smallint[], p_dias_mes smallint[] DEFAULT NULL::smallint[], p_fechas_anio smallint[] DEFAULT NULL::smallint[], p_fecha_unica date DEFAULT NULL::date, p_tarjeta_id bigint DEFAULT NULL::bigint, p_desde date DEFAULT NULL::date)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_desde  date := COALESCE(p_desde, CURRENT_DATE);
    v_cierre int;
    v_aviso  date;
    v_mes    date;
    v_res    date;
    i        int;
BEGIN
    IF p_modo = 'unica' THEN
        RETURN CASE WHEN p_fecha_unica IS NOT NULL AND p_fecha_unica >= v_desde
                    THEN p_fecha_unica END;
    END IF;

    -- Tarjeta: el día no lo decide el patrón sino el CIERRE (aviso = cierre - 3).
    -- Se prueban 15 meses para cubrir el arrastre cuando el cierre es día 1..3.
    IF p_tarjeta_id IS NOT NULL THEN
        SELECT t.dia_cierre INTO v_cierre
          FROM public.p_tarjetas_credito t WHERE t.tarjeta_id = p_tarjeta_id;
        IF v_cierre IS NULL THEN
            RETURN NULL;
        END IF;
        FOR i IN 0..14 LOOP
            v_mes := (date_trunc('month', v_desde) + (i || ' months')::interval)::date;
            v_aviso := v_mes
                       + (LEAST(v_cierre,
                                EXTRACT(DAY FROM (v_mes + INTERVAL '1 month' - INTERVAL '1 day'))::int
                               ) - 1) * INTERVAL '1 day'
                       - INTERVAL '3 days';
            IF v_aviso >= v_desde THEN
                RETURN v_aviso;
            END IF;
        END LOOP;
        RETURN NULL;
    END IF;

    -- Billetera: se busca el primer día que cumpla el patrón, con el recorte al
    -- último día del mes (30 y 31 en febrero caen los dos el 28 y dan UNA fecha).
    SELECT min(d)::date INTO v_res
      FROM generate_series(v_desde::timestamp,
                           (v_desde + INTERVAL '400 days')::timestamp,
                           INTERVAL '1 day') AS d
     WHERE (p_modo = 'semanal'
            AND EXTRACT(ISODOW FROM d)::int = ANY (COALESCE(p_dias_semana, '{}'::smallint[])))
        OR (p_modo = 'mensual'
            AND EXISTS (SELECT 1 FROM unnest(COALESCE(p_dias_mes, '{}'::smallint[])) AS x(valor)
                         WHERE LEAST(x.valor::int,
                                     EXTRACT(DAY FROM (date_trunc('month', d)
                                                       + INTERVAL '1 month' - INTERVAL '1 day'))::int
                                    ) = EXTRACT(DAY FROM d)::int))
        OR (p_modo = 'anual'
            AND EXISTS (SELECT 1 FROM unnest(COALESCE(p_fechas_anio, '{}'::smallint[])) AS f(valor)
                         WHERE (f.valor / 100)::int = EXTRACT(MONTH FROM d)::int
                           AND LEAST((f.valor % 100)::int,
                                     EXTRACT(DAY FROM (date_trunc('month', d)
                                                       + INTERVAL '1 month' - INTERVAL '1 day'))::int
                                    ) = EXTRACT(DAY FROM d)::int));
    RETURN v_res;
END;
$function$
