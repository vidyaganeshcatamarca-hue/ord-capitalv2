CREATE OR REPLACE FUNCTION public.fn_reporte_simulador_impacto(p_monto_total numeric, p_cuotas integer, p_tarjeta_id bigint, p_es_usd boolean, p_cotizacion_usd numeric DEFAULT 1)
 RETURNS TABLE(mes_vencimiento text, total_base_comprometido numeric, cuota_simulada numeric, total_con_simulacion numeric, capacidad_techo_promedio numeric, limite_tarjeta_excedido boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 DECLARE 
      v_user_id bigint; v_ingreso_prom_180 numeric; v_gasto_fijo_prom_180 numeric; v_capacidad_techo numeric;
      v_monto_final_ars numeric; v_cuota_simulada_individual numeric; v_limite_tarjeta_excedido boolean := false;
      v_limite_cuotas_tarjeta numeric := 0; v_consumo_cuotas_futuras_tarjeta numeric := 0; v_fin_ciclo_tarjeta date; v_dia_cierre_tarjeta int;
      v_dia_vencimiento_tarjeta int; v_vencimiento_ciclo_tarjeta date;
      v_mes_actual date := date_trunc('month', CURRENT_DATE); v_impuesto_pct numeric := 30.00;
  BEGIN
      SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
      IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

      SELECT COALESCE(SUM(valor_ingreso), 0) / 6 INTO v_ingreso_prom_180 FROM public.v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '180 days';
      SELECT COALESCE(SUM(valor_egreso), 0) / 6 INTO v_gasto_fijo_prom_180 FROM public.v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= CURRENT_DATE - INTERVAL '180 days';
      v_capacidad_techo := GREATEST(v_ingreso_prom_180 - v_gasto_fijo_prom_180, 0);
      
      IF p_es_usd THEN 
          IF p_tarjeta_id IS NOT NULL THEN
              -- S14: el adicional por compras en dolares se elimino del sistema.
              v_impuesto_pct := 0;
          ELSE
              SELECT COALESCE(SUM(porcentaje), 0) INTO v_impuesto_pct FROM p_impuesto_tarjeta WHERE activo = true;
          END IF;
          v_monto_final_ars := p_monto_total * p_cotizacion_usd * (1 + (v_impuesto_pct / 100));
      ELSE 
          v_monto_final_ars := p_monto_total; 
      END IF;
      v_cuota_simulada_individual := ROUND(v_monto_final_ars / p_cuotas, 2);

      IF p_tarjeta_id IS NOT NULL THEN
          SELECT limite_cuotas, dia_cierre, dia_vencimiento 
          INTO v_limite_cuotas_tarjeta, v_dia_cierre_tarjeta, v_dia_vencimiento_tarjeta 
          FROM public.p_tarjetas_credito 
          WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

          IF EXTRACT(DAY FROM CURRENT_DATE) <= v_dia_cierre_tarjeta THEN
              v_fin_ciclo_tarjeta := v_mes_actual + ((v_dia_cierre_tarjeta - 1) * INTERVAL '1 day');
          ELSE
              v_fin_ciclo_tarjeta := (v_mes_actual + INTERVAL '1 month') + ((v_dia_cierre_tarjeta - 1) * INTERVAL '1 day');
          END IF;

          IF v_dia_vencimiento_tarjeta <= v_dia_cierre_tarjeta THEN
              v_vencimiento_ciclo_tarjeta := (date_trunc('month', v_fin_ciclo_tarjeta) + INTERVAL '1 month') + ((v_dia_vencimiento_tarjeta - 1) * INTERVAL '1 day');
          ELSE
              v_vencimiento_ciclo_tarjeta := date_trunc('month', v_fin_ciclo_tarjeta) + ((v_dia_vencimiento_tarjeta - 1) * INTERVAL '1 day');
          END IF;

          SELECT COALESCE(SUM(monto_cuota), 0) INTO v_consumo_cuotas_futuras_tarjeta 
          FROM public.p_cuotas_detalle 
          WHERE tarjeta_id = p_tarjeta_id AND pagado = false AND fecha_estimada_pago > v_vencimiento_ciclo_tarjeta;

          IF v_monto_final_ars > (v_limite_cuotas_tarjeta - v_consumo_cuotas_futuras_tarjeta) THEN v_limite_tarjeta_excedido := true; END IF;
      END IF;

      RETURN QUERY
      WITH serie_meses AS (
          SELECT to_char(generate_series(date_trunc('month', CURRENT_DATE), date_trunc('month', CURRENT_DATE + INTERVAL '11 months'), INTERVAL '1 month'), 'YYYY-MM') AS año_mes, generate_series(0, 11) AS meses_desde_hoy
      )
      SELECT s.año_mes::text, COALESCE(SUM(cd.monto_cuota), 0)::numeric, 
             CASE WHEN s.meses_desde_hoy >= 1 AND s.meses_desde_hoy <= p_cuotas THEN v_cuota_simulada_individual ELSE 0::numeric END, 
             (COALESCE(SUM(cd.monto_cuota), 0) + CASE WHEN s.meses_desde_hoy >= 1 AND s.meses_desde_hoy <= p_cuotas THEN v_cuota_simulada_individual ELSE 0::numeric END)::numeric, 
             v_capacidad_techo::numeric, v_limite_tarjeta_excedido
      FROM serie_meses s
      LEFT JOIN public.p_cuotas_detalle cd ON to_char(cd.fecha_estimada_pago, 'YYYY-MM') = s.año_mes AND cd.user_id = v_user_id AND cd.pagado = false
      GROUP BY s.año_mes, s.meses_desde_hoy, v_capacidad_techo, v_limite_tarjeta_excedido, v_cuota_simulada_individual, p_cuotas
      ORDER BY s.año_mes ASC;
  END;
  $function$
