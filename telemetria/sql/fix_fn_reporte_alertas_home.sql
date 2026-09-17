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
    v_billeteras_rojas int := 0;
    v_vencimientos_3_dias jsonb := '[]'::jsonb;
    v_dias_asfixia_proximos int := 0;
    v_total_alertas int := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    -- 3. Contar egresos en cuarentena (estado en inglés: 'pending')
    SELECT COUNT(*) INTO v_egresos_cuarentena
    FROM p_caja_cuarentena
    WHERE user_id = v_user_id AND estado = 'pending';

    v_ingresos_cuarentena := 0;

    SELECT COUNT(*) INTO v_billeteras_rojas
    FROM p_billeteras
    WHERE user_id = v_user_id 
      AND activa = true
      AND (
          saldo_actual < 0 
          OR ultima_conciliacion_at IS NULL 
          OR (CURRENT_DATE - ultima_conciliacion_at::date) > 10
      );

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

    -- 7. Contar días de asfixia (estado en inglés: 'red')
    SELECT COUNT(*) INTO v_dias_asfixia_proximos
    FROM public.fn_reporte_radar_asfixia()
    WHERE estado_dia = 'red' AND dia BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days';

    v_total_alertas := v_egresos_cuarentena + v_ingresos_cuarentena + v_billeteras_rojas 
                     + jsonb_array_length(v_vencimientos_3_dias) 
                     + CASE WHEN v_dias_asfixia_proximos > 0 THEN 1 ELSE 0 END;

    RETURN jsonb_build_object(
        'egresos_cuarentena', v_egresos_cuarentena,
        'ingresos_cuarentena', v_ingresos_cuarentena,
        'billeteras_rojas', v_billeteras_rojas,
        'vencimientos_3_dias', v_vencimientos_3_dias,
        'dias_asfixia_proximos', v_dias_asfixia_proximos,
        'total_alertas', v_total_alertas
    );
END;
$function$

