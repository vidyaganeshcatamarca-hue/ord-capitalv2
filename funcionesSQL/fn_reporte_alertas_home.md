CREATE OR REPLACE FUNCTION public.fn_reporte_alertas_home()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_egresos_cuarentena int := 0;
    v_ingresos_cuarentena int := 0;
    v_otros_cuarentena int := 0;
    v_billeteras_rojas int := 0;
    v_vencimientos_3_dias jsonb := '[]'::jsonb;
    v_dias_asfixia_proximos int := 0;
    v_total_alertas int := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    -- Cuarentena desglosada por tipo. Las filas sin tipo no se pierden: van a otros.
    SELECT COUNT(*) FILTER (WHERE tipo IN ('expense', 'card_expense')),
           COUNT(*) FILTER (WHERE tipo = 'income'),
           COUNT(*) FILTER (WHERE tipo IS NULL OR tipo = 'transfer')
      INTO v_egresos_cuarentena, v_ingresos_cuarentena, v_otros_cuarentena
    FROM p_caja_cuarentena
    WHERE user_id = v_user_id AND estado = 'pendiente';

    -- Billeteras: solo conciliaciones vencidas hace mas de 10 dias.
    SELECT COUNT(*) INTO v_billeteras_rojas
    FROM p_billeteras
    WHERE user_id = v_user_id
      AND activa = true
      AND ultima_conciliacion_at IS NOT NULL
      AND (CURRENT_DATE - ultima_conciliacion_at::date) > 10;

    -- Vencimientos de tarjeta a 3 dias.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'tarjeta', x.tarjeta,
        'monto', x.monto,
        'dias', x.dias
    )), '[]'::jsonb) INTO v_vencimientos_3_dias
    FROM (
        SELECT t.nombre_tarjeta AS tarjeta,
               COALESCE(SUM(cd.monto_cuota), 0) AS monto,
               GREATEST(
                   CASE
                       WHEN EXTRACT(DAY FROM CURRENT_DATE) <= t.dia_vencimiento
                       THEN t.dia_vencimiento - EXTRACT(DAY FROM CURRENT_DATE)
                       ELSE (EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')) - EXTRACT(DAY FROM CURRENT_DATE) + t.dia_vencimiento)
                   END, 0
               )::int AS dias
        FROM p_tarjetas_credito t
        LEFT JOIN p_cuotas_detalle cd ON t.tarjeta_id = cd.tarjeta_id
            AND cd.pagado = false
            AND cd.fecha_estimada_pago BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
        WHERE t.user_id = v_user_id
          AND t.dia_vencimiento IS NOT NULL
          AND (
              (EXTRACT(DAY FROM CURRENT_DATE) <= t.dia_vencimiento AND t.dia_vencimiento - EXTRACT(DAY FROM CURRENT_DATE) <= 3)
              OR
              (EXTRACT(DAY FROM CURRENT_DATE) > t.dia_vencimiento AND (EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')) - EXTRACT(DAY FROM CURRENT_DATE) + t.dia_vencimiento) <= 3)
          )
        GROUP BY t.tarjeta_id, t.nombre_tarjeta, t.dia_vencimiento
    ) x;

    -- Dias de asfixia: fuera por ahora, el radar no se implementa todavia.
    v_dias_asfixia_proximos := 0;

    v_total_alertas := v_egresos_cuarentena + v_ingresos_cuarentena + v_otros_cuarentena
                     + v_billeteras_rojas
                     + jsonb_array_length(v_vencimientos_3_dias);

    RETURN jsonb_build_object(
        'egresos_cuarentena', v_egresos_cuarentena,
        'ingresos_cuarentena', v_ingresos_cuarentena,
        'otros_cuarentena', v_otros_cuarentena,
        'billeteras_rojas', v_billeteras_rojas,
        'vencimientos_3_dias', v_vencimientos_3_dias,
        'dias_asfixia_proximos', v_dias_asfixia_proximos,
        'total_alertas', v_total_alertas
    );
END;
$function$
