CREATE OR REPLACE FUNCTION public.fn_telemetry_refresh_user_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.p_telemetry_user_metrics AS m (
    user_id, calculated_at, active_days_7d, active_days_30d, movement_days_30d,
    sessions_30d, active_seconds_30d, active_wallet_count, custom_category_count,
    distinct_categories_used_30d, reconciliation_count, days_since_last_reconciliation,
    active_card_count, has_card_activity_30d, budget_coverage_ratio,
    budget_used_next_cycle, modules_used_30d
  )
  SELECT
    u.user_id,
    now(),
    COALESCE(s.ad7, 0),
    COALESCE(s.ad30, 0),
    COALESCE(mv.mdays, 0),
    COALESCE(s.s30, 0),
    COALESCE(s.secs30, 0),
    COALESCE(w.cnt, 0),
    COALESCE(cat.cnt, 0),
    COALESCE(mv.cats, 0),
    COALESCE(con.cnt, 0),
    con.days_since,
    COALESCE(c.cnt, 0),
    COALESCE(ca.has_act, false),
    COALESCE(
      CASE
        WHEN ex.spent > 0 THEN LEAST(b.assigned / ex.spent, 1)
        WHEN b.assigned > 0 THEN 1
        ELSE 0
      END, 0),
    COALESCE(nc.has_next, false),
    COALESCE(mods.usage, '{}'::jsonb)
  FROM public.usuarios u
  LEFT JOIN (
    SELECT user_id,
           count(DISTINCT (started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
             FILTER (WHERE started_at >= now() - interval '7 days') AS ad7,
           count(DISTINCT (started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
             FILTER (WHERE started_at >= now() - interval '30 days') AS ad30,
           count(*) FILTER (WHERE started_at >= now() - interval '30 days') AS s30,
           COALESCE(sum(total_active_seconds) FILTER (WHERE started_at >= now() - interval '30 days'), 0) AS secs30
    FROM public.p_app_sessions GROUP BY user_id
  ) s ON s.user_id = u.user_id
  LEFT JOIN (
    SELECT user_id,
           count(DISTINCT fecha) AS mdays,
           count(DISTINCT estructura_egreso_id) AS cats
    FROM public.p_caja
    WHERE tipo IN ('expense','income','transfer')
      AND fecha >= (now() - interval '30 days')::date
    GROUP BY user_id
  ) mv ON mv.user_id = u.user_id
  LEFT JOIN (SELECT user_id, count(*) AS cnt FROM public.p_billeteras GROUP BY user_id) w
    ON w.user_id = u.user_id
  LEFT JOIN (
    SELECT user_id, count(*) AS cnt
    FROM public.p_estructuras_egresos
    WHERE nombre_cuenta NOT IN ('cat_mystery','no_detail')
    GROUP BY user_id
  ) cat ON cat.user_id = u.user_id
  LEFT JOIN (
    SELECT user_id, count(*) AS cnt,
           EXTRACT(DAY FROM now() - max(fecha))::int AS days_since
    FROM public.p_conciliaciones GROUP BY user_id
  ) con ON con.user_id = u.user_id
  LEFT JOIN (SELECT user_id, count(*) AS cnt FROM public.p_tarjetas_credito GROUP BY user_id) c
    ON c.user_id = u.user_id
  LEFT JOIN (
    SELECT DISTINCT user_id, true AS has_act
    FROM public.p_caja
    WHERE tipo = 'pago_tarjeta' AND fecha >= (now() - interval '30 days')::date
  ) ca ON ca.user_id = u.user_id
  LEFT JOIN (
    SELECT user_id, COALESCE(sum(monto_limite), 0) AS assigned
    FROM public.p_presupuestos
    WHERE mes_periodo = date_trunc('month', CURRENT_DATE)::date
    GROUP BY user_id
  ) b ON b.user_id = u.user_id
  LEFT JOIN (
    SELECT user_id, COALESCE(sum(valor_egreso), 0) AS spent
    FROM public.p_caja
    WHERE tipo = 'expense' AND fecha >= date_trunc('month', CURRENT_DATE)
    GROUP BY user_id
  ) ex ON ex.user_id = u.user_id
  LEFT JOIN (
    SELECT DISTINCT user_id, true AS has_next
    FROM public.p_presupuestos
    WHERE mes_periodo = date_trunc('month', CURRENT_DATE)::date + 1
  ) nc ON nc.user_id = u.user_id
  LEFT JOIN (
    SELECT user_id, jsonb_object_agg(event_name, cnt) AS usage
    FROM (
      SELECT user_id, event_name, count(*) AS cnt
      FROM public.p_telemetry_events
      WHERE event_timestamp >= now() - interval '30 days'
      GROUP BY user_id, event_name
    ) x GROUP BY user_id
  ) mods ON mods.user_id = u.user_id
  ON CONFLICT (user_id) DO UPDATE SET
    calculated_at = EXCLUDED.calculated_at,
    active_days_7d = EXCLUDED.active_days_7d,
    active_days_30d = EXCLUDED.active_days_30d,
    movement_days_30d = EXCLUDED.movement_days_30d,
    sessions_30d = EXCLUDED.sessions_30d,
    active_seconds_30d = EXCLUDED.active_seconds_30d,
    active_wallet_count = EXCLUDED.active_wallet_count,
    custom_category_count = EXCLUDED.custom_category_count,
    distinct_categories_used_30d = EXCLUDED.distinct_categories_used_30d,
    reconciliation_count = EXCLUDED.reconciliation_count,
    days_since_last_reconciliation = EXCLUDED.days_since_last_reconciliation,
    active_card_count = EXCLUDED.active_card_count,
    has_card_activity_30d = EXCLUDED.has_card_activity_30d,
    budget_coverage_ratio = EXCLUDED.budget_coverage_ratio,
    budget_used_next_cycle = EXCLUDED.budget_used_next_cycle,
    modules_used_30d = EXCLUDED.modules_used_30d;

  RETURN jsonb_build_object('ok', true, 'users_upserted', (SELECT count(*) FROM public.usuarios));
END;
$function$;

-- ============================================================
-- Tanda 5 telemetria (2026-09-18): upsert set-based de p_telemetry_user_metrics
-- para TODOS los usuarios (16 metricas: dias activos 7/30, dias con movimientos,
-- sesiones/tiempo, billeteras, categorias, conciliaciones, tarjetas, cobertura
-- de presupuesto, uso de modulos desde p_telemetry_events). Sin backfill.
-- Schedulada via pg_cron diario 13:00 UTC (10:00 AR). RLS sin politicas.
-- ============================================================
