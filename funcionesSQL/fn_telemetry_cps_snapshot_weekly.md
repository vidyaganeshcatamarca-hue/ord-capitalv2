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

-- ============================================================
-- Tanda 5 telemetria (2026-09-18): calcula CPS 0-100 (cps_basic_v1) por
-- usuario desde p_telemetry_user_metrics con pesos/targets/cortes de
-- app_global_config (via fn_config_num) e inserta 1 snapshot semanal por
-- usuario (guard: no existe snapshot de la semana para esa score_version).
-- Categorias: bajo <25, medio <50, alto <75, high_potential <90,
-- very_high_potential >=90. Schedulada via pg_cron lunes 14:00 UTC (11:00 AR).
-- Nunca reinterpretar historico: formula nueva => score_version nueva.
-- ============================================================
