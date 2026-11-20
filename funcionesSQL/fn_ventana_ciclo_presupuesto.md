CREATE OR REPLACE FUNCTION public.fn_ventana_ciclo_presupuesto(p_user_id bigint, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS TABLE(inicio date, fin date, mes_periodo date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH d AS (
        SELECT COALESCE((SELECT COALESCE(c.dia_ancla_ciclo, 1)::int
                           FROM public.p_presupuestos_config c
                          WHERE c.user_id = p_user_id), 1) AS ancla
    ), b AS (
        SELECT d.ancla,
               CASE WHEN EXTRACT(day FROM p_fecha)::int >= d.ancla
                    THEN date_trunc('month', p_fecha)::date
                    ELSE (date_trunc('month', p_fecha) - INTERVAL '1 month')::date END AS base
          FROM d
    )
    SELECT (b.base + ((b.ancla - 1) * INTERVAL '1 day'))::date,
           (b.base + ((b.ancla - 1) * INTERVAL '1 day') + INTERVAL '1 month' - INTERVAL '1 day')::date,
           b.base
      FROM b;
$function$
