-- fn_reporte_top_fuentes_ingreso v2 — owner directive 2026: the donut must
-- show ALL income of the period. Incomes without an associated source
-- (p_caja.cuenta_ingreso_id NULL) enter the total AND appear as one synthetic
-- segment (fuente_id NULL, machine key 'fuente_sin_asociar' for i18n).
-- Return shape unchanged.

CREATE OR REPLACE FUNCTION public.fn_reporte_top_fuentes_ingreso(
  p_periodo text DEFAULT 'mes_actual'
)
 RETURNS TABLE(fuente_id bigint, nombre text, icono text, color text, total_ingresado numeric, porcentaje_del_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_f_inicio date;
  v_f_fin date;
  v_total_periodo numeric := 0;
BEGIN
  -- Identidad del usuario (regla: nunca recibir user_id por parámetro)
  SELECT user_id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  -- Resolución del rango según período
  IF p_periodo = 'semana_actual' THEN
    v_f_inicio := date_trunc('week', CURRENT_DATE)::date;
    v_f_fin   := (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::date;
  ELSIF p_periodo = 'mes_anterior' THEN
    v_f_inicio := date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::date;
    v_f_fin   := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date;
  ELSIF p_periodo = 'anio_actual' THEN
    v_f_inicio := date_trunc('year', CURRENT_DATE)::date;
    v_f_fin   := (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year - 1 day')::date;
  ELSE
    -- Default: mes_actual
    v_f_inicio := date_trunc('month', CURRENT_DATE)::date;
    v_f_fin   := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date;
  END IF;

  IF v_f_inicio > v_f_fin THEN
    RAISE EXCEPTION '{"key": "error_invalid_date_range", "params": {}}';
  END IF;

  -- Total del período (TODOS los ingresos, con o sin fuente) para los %.
  SELECT COALESCE(SUM(c.valor_ingreso), 0) INTO v_total_periodo
  FROM public.p_caja c
  WHERE c.tipo = 'income'
    AND c.fecha BETWEEN v_f_inicio AND v_f_fin
    AND c.user_id = v_user_id;

  -- Si no hay ingresos, retornamos vacío (el frontend decide ocultar)
  IF v_total_periodo = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ingresos AS (
    SELECT
      c.cuenta_ingreso_id AS fuente_id,
      SUM(c.valor_ingreso) AS total
    FROM public.p_caja c
    WHERE c.tipo = 'income'
      AND c.fecha BETWEEN v_f_inicio AND v_f_fin
      AND c.user_id = v_user_id
    GROUP BY c.cuenta_ingreso_id
  ),
  con_fuente AS (
    SELECT
      i.fuente_id,
      p.nombre::text AS nombre,
      COALESCE(p.icono, '💰')::text AS icono,
      COALESCE(p.color, '#22C55E')::text AS color,
      i.total::numeric AS total,
      ROUND((i.total / v_total_periodo) * 100, 2)::numeric AS pct
    FROM ingresos i
    INNER JOIN public.p_ingresos p ON p.producto_id = i.fuente_id
    WHERE i.fuente_id IS NOT NULL
  )
  SELECT
    c.fuente_id, c.nombre, c.icono, c.color, c.total, c.pct
  FROM con_fuente c
  UNION ALL
  -- Segmento sintético: ingresos SIN fuente asociada (solo si suman > 0)
  SELECT
    NULL::bigint,
    'fuente_sin_asociar'::text,
    '❔'::text,
    '#64748B'::text,
    i2.total::numeric,
    ROUND((i2.total / v_total_periodo) * 100, 2)::numeric AS pct
  FROM (
    SELECT SUM(c.valor_ingreso) AS total
    FROM public.p_caja c
    WHERE c.tipo = 'income'
      AND c.fecha BETWEEN v_f_inicio AND v_f_fin
      AND c.user_id = v_user_id
      AND c.cuenta_ingreso_id IS NULL
  ) i2
  WHERE i2.total > 0
  ORDER BY 6 DESC;

END;
$function$