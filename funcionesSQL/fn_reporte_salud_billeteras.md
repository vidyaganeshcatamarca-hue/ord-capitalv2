CREATE OR REPLACE FUNCTION public.fn_reporte_salud_billeteras()
RETURNS TABLE(billetera_id bigint, nombre text, moneda text, saldo_actual numeric, dias_sin_conciliar integer, estado_semaforo_key text, alertas_keys text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id bigint;
  v_hoy date := CURRENT_DATE;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.usuarios
  WHERE auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
  END IF;

  RETURN QUERY
  SELECT
    b.billetera_id,
    b.nombre,
    b.moneda,
    b.saldo_actual,
    COALESCE(v_hoy - b.ultima_conciliacion_at::date, 9999) AS dias_sin_conciliar,
    CASE
      WHEN b.saldo_inicial_pendiente THEN 'green'
      WHEN b.ultima_conciliacion_at IS NULL THEN 'red'
      WHEN (v_hoy - b.ultima_conciliacion_at::date) <= 4 THEN 'green'
      WHEN (v_hoy - b.ultima_conciliacion_at::date) <= 10 THEN 'yellow'
      ELSE 'red'
    END AS estado_semaforo_key,
    ARRAY(
      SELECT unnest
      FROM unnest(ARRAY[
        CASE WHEN b.saldo_actual < 0 THEN 'negative_balance' ELSE NULL END,
        CASE
          WHEN b.saldo_inicial_pendiente = false
            AND NOT EXISTS (
              SELECT 1
              FROM public.p_caja c
              WHERE c.billetera_origen_id = b.billetera_id
                AND c.fecha >= v_hoy - INTERVAL '60 days'
            )
            AND (b.ultima_conciliacion_at IS NULL OR b.ultima_conciliacion_at::date < v_hoy - 60)
          THEN 'no_movements'
          ELSE NULL
        END,
        CASE
          WHEN b.saldo_inicial_pendiente = false
            AND ((v_hoy - b.ultima_conciliacion_at::date) > 10 OR b.ultima_conciliacion_at IS NULL)
          THEN 'unreconciled'
          ELSE NULL
        END
      ])
      WHERE unnest IS NOT NULL
    ) AS alertas_keys
  FROM public.p_billeteras b
  WHERE b.user_id = v_user_id
    AND b.activa = true;
END;
$function$;
