-- ============================================================
-- Tanda 5: Motor CPS (ORD Capital Personal)
-- Tablas de metricas + snapshots, RPCs de refresco/snapshot,
-- semillas de config y jobs pg_cron (diario + semanal).
-- ============================================================

-- Helper de configuracion (clave/valor numerico con default)
CREATE OR REPLACE FUNCTION public.fn_config_num(p_clave text, p_default numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT valor::numeric FROM public.app_global_config WHERE clave = p_clave),
    p_default)
$function$;

-- 1. Tabla de metricas por usuario
CREATE TABLE IF NOT EXISTS public.p_telemetry_user_metrics (
  user_id bigint PRIMARY KEY REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  active_days_7d int NOT NULL DEFAULT 0,
  active_days_30d int NOT NULL DEFAULT 0,
  movement_days_30d int NOT NULL DEFAULT 0,
  sessions_30d int NOT NULL DEFAULT 0,
  active_seconds_30d int NOT NULL DEFAULT 0,
  active_wallet_count int NOT NULL DEFAULT 0,
  custom_category_count int NOT NULL DEFAULT 0,
  distinct_categories_used_30d int NOT NULL DEFAULT 0,
  reconciliation_count int NOT NULL DEFAULT 0,
  days_since_last_reconciliation int,
  active_card_count int NOT NULL DEFAULT 0,
  has_card_activity_30d boolean NOT NULL DEFAULT false,
  budget_coverage_ratio numeric NOT NULL DEFAULT 0,
  budget_used_next_cycle boolean NOT NULL DEFAULT false,
  modules_used_30d jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.p_telemetry_user_metrics ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.p_telemetry_user_metrics IS 'Metricas consolidadas por usuario para CPS/ORD Admin. Refresco diario via pg_cron (fn_telemetry_refresh_user_metrics). Sin acceso frontend directo.';

-- 2. Tabla de snapshots semanales del CPS
CREATE TABLE IF NOT EXISTS public.p_telemetry_cps_snapshots (
  snapshot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.usuarios(user_id) ON DELETE CASCADE,
  score_value int NOT NULL,
  score_version text NOT NULL DEFAULT 'cps_basic_v1',
  categoria text NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_cps_snapshots_user_time
  ON public.p_telemetry_cps_snapshots (user_id, calculated_at);
ALTER TABLE public.p_telemetry_cps_snapshots ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.p_telemetry_cps_snapshots IS 'Historico semanal versionado del CPS. Nunca reinterpretar snapshots viejos con formula nueva: version nueva => score_version nueva.';

-- 3. Semillas de configuracion CPS (pesos, targets y cortes)
INSERT INTO public.app_global_config (clave, valor, descripcion) VALUES
  ('cps_weight_frequency', '40', 'CPS: peso de frecuencia de uso (dias activos + dias con movimientos)'),
  ('cps_weight_cards', '20', 'CPS: peso de adopcion de tarjetas'),
  ('cps_weight_budget', '20', 'CPS: peso de adopcion de presupuesto'),
  ('cps_weight_reconciliation', '15', 'CPS: peso de adopcion de conciliacion'),
  ('cps_weight_wallets_categories', '10', 'CPS: peso de billeteras + categorias custom'),
  ('cps_target_active_days_30d', '15', 'CPS: dias activos en 30d que puntuan 100% de la senal de frecuencia (componente 1)'),
  ('cps_target_movement_days_30d', '12', 'CPS: dias con movimientos en 30d que puntuan 100% (componente 2 de frecuencia)'),
  ('cps_target_wallets', '3', 'CPS: billeteras activas que puntuan 100%'),
  ('cps_target_custom_categories', '10', 'CPS: categorias custom que puntuan 100%'),
  ('cps_target_reconciliation_count', '4', 'CPS: conciliaciones que puntuan 100% del componente cantidad'),
  ('cps_reconciliation_recent_days', '30', 'CPS: dias desde ultima conciliacion para considerar reciente'),
  ('cps_cut_bajo', '25', 'CPS: corte inferior de la categoria medio'),
  ('cps_cut_medio', '50', 'CPS: corte inferior de la categoria alto'),
  ('cps_cut_alto', '75', 'CPS: corte inferior de la categoria high_potential'),
  ('cps_cut_high_potential', '90', 'CPS: corte inferior de la categoria very_high_potential')
ON CONFLICT (clave) DO NOTHING;

-- 4. RPC de refresco diario de metricas (todos los usuarios, set-based)
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

-- 5. RPC de snapshot semanal del CPS
CREATE OR REPLACE FUNCTION public.fn_telemetry_cps_snapshot_weekly()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_weight_freq numeric := public.fn_config_num('cps_weight_frequency', 40);
  v_weight_cards numeric := public.fn_config_num('cps_weight_cards', 20);
  v_weight_budget numeric := public.fn_config_num('cps_weight_budget', 20);
  v_weight_recon numeric := public.fn_config_num('cps_weight_reconciliation', 15);
  v_weight_wc numeric := public.fn_config_num('cps_weight_wallets_categories', 10);
  v_t_ad30 numeric := public.fn_config_num('cps_target_active_days_30d', 15);
  v_t_md30 numeric := public.fn_config_num('cps_target_movement_days_30d', 12);
  v_t_wallets numeric := public.fn_config_num('cps_target_wallets', 3);
  v_t_cats numeric := public.fn_config_num('cps_target_custom_categories', 10);
  v_t_recon numeric := public.fn_config_num('cps_target_reconciliation_count', 4);
  v_recon_recent int := public.fn_config_num('cps_reconciliation_recent_days', 30);
  v_cut_bajo numeric := public.fn_config_num('cps_cut_bajo', 25);
  v_cut_medio numeric := public.fn_config_num('cps_cut_medio', 50);
  v_cut_alto numeric := public.fn_config_num('cps_cut_alto', 75);
  v_cut_hp numeric := public.fn_config_num('cps_cut_high_potential', 90);
  v_insertados int := 0;
BEGIN
  WITH scores AS (
    SELECT
      m.user_id,
      ROUND(
        v_weight_freq * LEAST(
          LEAST(m.active_days_30d / NULLIF(v_t_ad30, 0), 1) * 0.5
          + LEAST(m.movement_days_30d / NULLIF(v_t_md30, 0), 1) * 0.5, 1)
        + v_weight_cards * LEAST(LEAST(m.active_card_count, 1) * 0.5 + CASE WHEN m.has_card_activity_30d THEN 0.5 ELSE 0 END, 1)
        + v_weight_budget * LEAST(m.budget_coverage_ratio, 1)
        + v_weight_recon * LEAST(
            LEAST(m.reconciliation_count / NULLIF(v_t_recon, 0), 1) * 0.7
            + CASE WHEN m.days_since_last_reconciliation IS NOT NULL
                    AND m.days_since_last_reconciliation <= v_recon_recent THEN 0.3 ELSE 0 END, 1)
        + v_weight_wc * LEAST(
            LEAST(m.active_wallet_count / NULLIF(v_t_wallets, 0), 1) * 0.5
            + LEAST(m.custom_category_count / NULLIF(v_t_cats, 0), 1) * 0.5, 1)
      )::int AS score,
      to_jsonb(m) AS metrics_json
    FROM public.p_telemetry_user_metrics m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.p_telemetry_cps_snapshots s
      WHERE s.user_id = m.user_id
        AND s.score_version = 'cps_basic_v1'
        AND date_trunc('week', s.calculated_at) = date_trunc('week', now())
    )
  )
  INSERT INTO public.p_telemetry_cps_snapshots
    (user_id, score_value, score_version, categoria, calculated_at, metrics_snapshot)
  SELECT
    user_id, score, 'cps_basic_v1',
    CASE
      WHEN score >= v_cut_hp THEN 'very_high_potential'
      WHEN score >= v_cut_alto THEN 'high_potential'
      WHEN score >= v_cut_medio THEN 'alto'
      WHEN score >= v_cut_bajo THEN 'medio'
      ELSE 'bajo'
    END,
    now(),
    metrics_json
  FROM scores
  WHERE score IS NOT NULL;
  GET DIAGNOSTICS v_insertados = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'snapshots_inserted', v_insertados);
END;
$function$;

-- 6. Jobs pg_cron (diario 13:00 UTC = 10:00 AR; semanal lunes 14:00 UTC = 11:00 AR)
SELECT cron.unschedule('telemetry-refresh-metrics') WHERE EXISTS
  (SELECT 1 FROM cron.job WHERE jobname = 'telemetry-refresh-metrics');
SELECT cron.schedule('telemetry-refresh-metrics', '0 13 * * *',
  $$SELECT public.fn_telemetry_refresh_user_metrics()$$);

SELECT cron.unschedule('telemetry-cps-snapshot-weekly') WHERE EXISTS
  (SELECT 1 FROM cron.job WHERE jobname = 'telemetry-cps-snapshot-weekly');
SELECT cron.schedule('telemetry-cps-snapshot-weekly', '0 14 * * 1',
  $$SELECT public.fn_telemetry_cps_snapshot_weekly()$$);

-- 7. Primera corrida inmediata para no esperar al cron
SELECT public.fn_telemetry_refresh_user_metrics();
SELECT public.fn_telemetry_cps_snapshot_weekly();