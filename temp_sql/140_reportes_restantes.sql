-- 140: las que quedaron del triaje. Suman gasto o ingreso sin unir el rubro, asi que
-- contaban las patas de transferencia entre monedas igual que las 14 de 136. Mismo criterio:
-- leen de v_p_caja_reportable. Las que ya unen p_estructuras_egresos, filtran por proyecto o
-- por cuenta no se tocan: por construccion no ven una pata sin rubro.

-- fn_obtener_saldo_disponible_para_asignar(date): 1 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_obtener_saldo_disponible_para_asignar(p_mes_periodo date)
 RETURNS TABLE(total_ingresos numeric, total_asignado numeric, total_compromisos_tarjeta numeric, saldo_final_disponible numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_fecha_inicio date;
    v_fecha_fin date;
    v_dia_ancla int2;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    SELECT dia_ancla_ciclo INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;
    IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;
    
    v_fecha_inicio := date_trunc('month', p_mes_periodo) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_fecha_fin := (v_fecha_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- 1. Total Ingresos del mes
    SELECT COALESCE(SUM(valor_ingreso), 0) INTO total_ingresos 
    FROM v_p_caja_reportable 
    WHERE tipo = 'income' AND fecha BETWEEN v_fecha_inicio AND v_fecha_fin
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));

    -- 2. Total ya asignado en sobres (presupuestos)
    SELECT COALESCE(SUM(monto_limite), 0) INTO total_asignado 
    FROM p_presupuestos 
    WHERE mes_periodo = date_trunc('month', p_mes_periodo)
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));

    -- 3. Total cuotas de tarjeta que vencen este mes
    SELECT COALESCE(SUM(monto_cuota), 0) INTO total_compromisos_tarjeta 
    FROM p_compromisos_tarjeta 
    WHERE mes_periodo = date_trunc('month', p_mes_periodo)
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));

    -- 4. El número final que el Frontend debe mostrar
    saldo_final_disponible := total_ingresos - total_asignado - total_compromisos_tarjeta;

    RETURN NEXT;
END; $function$;

-- fn_obtener_techo_presupuestario(): 2 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_obtener_techo_presupuestario()
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint;
    v_techo numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(SUM(valor_income), 0) / 3 INTO v_techo
    FROM (
        SELECT SUM(valor_ingreso) as valor_income 
        FROM v_p_caja_reportable 
        WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days'
    ) as sub;
    
    IF v_techo = 0 THEN 
        SELECT COALESCE(SUM(valor_ingreso), 0) INTO v_techo FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'income';
    END IF;

    RETURN ROUND(v_techo, 2);
END; $function$;

-- fn_reporte_escudo_tiempo(): 3 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_escudo_tiempo()
 RETURNS TABLE(arsenal_total numeric, deuda_total numeric, deuda_60_dias numeric, capital_real numeric, capital_corto_plazo numeric, burn_rate_actual numeric, burn_rate_supervivencia numeric, dias_actual_deuda_total integer, dias_actual_deuda_corta integer, dias_supervivencia_deuda_total integer, dias_supervivencia_deuda_corta integer, ventana_dias_usada integer, estado_alerta_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_cotizacion_usd numeric;
    v_ventana_dias int;
    v_arsenal_billeteras numeric := 0;
    v_arsenal_inversiones numeric := 0;
    v_deuda_prestamos numeric := 0;
    v_deuda_tarjetas_total numeric := 0;
    v_deuda_tarjetas_60 numeric := 0;
    v_gasto_total numeric := 0;
    v_gasto_necesidad numeric := 0;
    v_burn_actual numeric := 0;
    v_burn_supervivencia numeric := 0;
    v_capital_real numeric := 0;
    v_capital_corto numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(
        (SELECT valor_por_usd FROM p_divisas WHERE nombre = 'USD' ORDER BY ultima_actualizacion DESC LIMIT 1),
        1.00
    ) INTO v_cotizacion_usd;

    SELECT COALESCE(SUM(
        CASE WHEN moneda = 'USD' THEN saldo_actual * v_cotizacion_usd ELSE saldo_actual END
    ), 0) INTO v_arsenal_billeteras
    FROM p_billeteras WHERE user_id = v_user_id AND activa = true;

    SELECT COALESCE(SUM(
        CASE WHEN b.moneda = 'USD' THEN
            (i.monto_invertido_original + (i.monto_invertido_original * (COALESCE(i.tasa_anual_tna,0) / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)) * v_cotizacion_usd
        ELSE
            (i.monto_invertido_original + (i.monto_invertido_original * (COALESCE(i.tasa_anual_tna,0) / 100) * (CURRENT_DATE - i.fecha_inicio) / 365))
        END
    ), 0) INTO v_arsenal_inversiones
    FROM p_inversiones i
    JOIN p_billeteras b ON i.billetera_origen_id = b.billetera_id
    WHERE i.user_id = v_user_id AND i.estado = 'activa';

    SELECT COALESCE(SUM(monto_total_deuda - monto_pagado_acumulado), 0) INTO v_deuda_prestamos
    FROM p_prestamos WHERE user_id = v_user_id AND tipo_flujo = 'debo' AND estado != 'cancelado';

    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_deuda_tarjetas_total
    FROM (
        SELECT monto_cuota FROM p_compromisos_tarjeta WHERE user_id = v_user_id
        UNION ALL
        SELECT monto_cuota FROM p_cuotas_detalle WHERE user_id = v_user_id AND pagado = false
    ) sub;

    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_deuda_tarjetas_60
    FROM (
        SELECT monto_cuota, mes_periodo as fecha_pago FROM p_compromisos_tarjeta WHERE user_id = v_user_id
        UNION ALL
        SELECT monto_cuota, fecha_estimada_pago as fecha_pago FROM p_cuotas_detalle WHERE user_id = v_user_id AND pagado = false
    ) sub
    WHERE fecha_pago <= CURRENT_DATE + INTERVAL '60 days';

    -- FIX: date - date ya retorna integer (días), no necesita EXTRACT
    SELECT LEAST(180, GREATEST((CURRENT_DATE - MIN(fecha))::int, 1)) INTO v_ventana_dias
    FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'expense';

    IF v_ventana_dias IS NULL THEN v_ventana_dias := 1; END IF;

    SELECT COALESCE(SUM(valor_egreso), 0) INTO v_gasto_total
    FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= CURRENT_DATE - INTERVAL '180 days';

    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_gasto_necesidad
    FROM v_p_caja_reportable c
    JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'need' AND c.fecha >= CURRENT_DATE - INTERVAL '180 days';

    v_burn_actual := v_gasto_total / v_ventana_dias;
    v_burn_supervivencia := v_gasto_necesidad / v_ventana_dias;

    v_capital_real := (v_arsenal_billeteras + v_arsenal_inversiones) - (v_deuda_prestamos + v_deuda_tarjetas_total);
    v_capital_corto := (v_arsenal_billeteras + v_arsenal_inversiones) - v_deuda_tarjetas_60;

    RETURN QUERY SELECT
        (v_arsenal_billeteras + v_arsenal_inversiones)::numeric,
        (v_deuda_prestamos + v_deuda_tarjetas_total)::numeric,
        v_deuda_tarjetas_60::numeric,
        v_capital_real::numeric,
        v_capital_corto::numeric,
        v_burn_actual::numeric,
        v_burn_supervivencia::numeric,
        CASE WHEN v_capital_real <= 0 OR v_burn_actual <= 0 THEN 0 ELSE (v_capital_real / v_burn_actual)::integer END,
        CASE WHEN v_capital_corto <= 0 OR v_burn_actual <= 0 THEN 0 ELSE (v_capital_corto / v_burn_actual)::integer END,
        CASE WHEN v_capital_real <= 0 OR v_burn_supervivencia <= 0 THEN 0 ELSE (v_capital_real / v_burn_supervivencia)::integer END,
        CASE WHEN v_capital_corto <= 0 OR v_burn_supervivencia <= 0 THEN 0 ELSE (v_capital_corto / v_burn_supervivencia)::integer END,
        v_ventana_dias::integer,
        CASE
            WHEN v_capital_real <= 0 THEN 'critical'::text
            WHEN (v_capital_real / NULLIF(v_burn_supervivencia,0)) < 90 THEN 'warning'::text
            ELSE 'safe'::text
        END;
END;
$function$;

-- fn_reporte_escudo_tiempo(uuid): 3 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_escudo_tiempo(p_user_id uuid)
 RETURNS TABLE(ingreso_promedio numeric, gasto_fijo_promedio numeric, gasto_variable_promedio numeric, ahorro_neto numeric, dias_escudo integer, calificacion_escudo text, mensaje text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ingreso_prom_180 numeric;
  v_gasto_fijo_prom_180 numeric;
  v_gasto_variable_prom_180 numeric;
  v_ahorro_neto numeric;
  v_dias_escudo integer;
  v_calificacion text;
  v_mensaje text;
BEGIN
  SELECT COALESCE(SUM(valor_ingreso), 0) / 6 INTO v_ingreso_prom_180 FROM v_p_caja_reportable WHERE user_id = p_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '180 days';
  SELECT COALESCE(SUM(valor_egreso), 0) INTO v_gasto_fijo_prom_180 FROM v_p_caja_reportable WHERE user_id = p_user_id AND tipo = 'expense' AND fecha >= CURRENT_DATE - INTERVAL '180 days';
  SELECT COALESCE(SUM(valor_egreso), 0) INTO v_gasto_variable_prom_180 FROM v_p_caja_reportable WHERE user_id = p_user_id AND tipo = 'expense' AND fecha >= CURRENT_DATE - INTERVAL '180 days';
  SELECT COALESCE((SELECT valor_por_usd FROM p_divisas WHERE nombre = 'USD' ORDER BY ultima_actualizacion DESC LIMIT 1), 1.00) INTO v_gasto_fijo_prom_180;
  v_ahorro_neto := v_ingreso_prom_180 - v_gasto_fijo_prom_180;
  SELECT fn_dias_escudo(v_ingreso_prom_180, v_gasto_fijo_prom_180) INTO v_dias_escudo;

  IF v_dias_escudo >= 90 THEN
    v_calificacion := 'Excelente';
    v_mensaje := 'Tienes un escudo financiero sólido para más de 90 días.';
  ELSIF v_dias_escudo >= 30 THEN
    v_calificacion := 'Bueno';
    v_mensaje := 'Tu escudo cubre al menos 30 días. Sigue así.';
  ELSIF v_dias_escudo >= 7 THEN
    v_calificacion := 'Precario';
    v_mensaje := 'Tenés menos de 30 días de escudo. Revisá gastos.';
  ELSE
    v_calificacion := 'Crítico';
    v_mensaje := 'Tu escudo es menor a 7 días. Ação inmediata requerida.';
  END IF;

  RETURN QUERY SELECT v_ingreso_prom_180, v_gasto_fijo_prom_180, v_gasto_variable_prom_180, v_ahorro_neto, v_dias_escudo, v_calificacion, v_mensaje;
END;
$function$;

-- fn_reporte_evolucion_presupuesto(): 4 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_evolucion_presupuesto()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_pct_nec_config numeric;
    v_pct_des_config numeric;
    v_pct_ahorro_config numeric;
    v_pct_diezmo_config numeric;
    v_evolucion jsonb := '[]'::jsonb;
    v_mes date;
    v_f_inicio date;
    v_f_fin date;
    v_ingreso_mes numeric;
    v_cons_nec numeric;
    v_cons_des numeric;
    v_cons_diezmo numeric;
    v_cons_ahorro numeric;
    v_i int;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    
    SELECT porcentaje_necesidades, porcentaje_deseos, porcentaje_ahorro, porcentaje_diezmo
    INTO v_pct_nec_config, v_pct_des_config, v_pct_ahorro_config, v_pct_diezmo_config
    FROM p_presupuestos_config WHERE user_id = v_user_id;
    
    IF v_pct_nec_config IS NULL THEN
        v_pct_nec_config := 50; v_pct_des_config := 30; v_pct_ahorro_config := 20; v_pct_diezmo_config := 0;
    END IF;
    
    FOR v_i IN 5..0 BY -1 LOOP
        v_mes := date_trunc('month', CURRENT_DATE - (v_i || ' months')::interval);
        SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(v_mes);
        
        SELECT COALESCE(SUM(valor_ingreso), 0) INTO v_ingreso_mes
        FROM v_p_caja_reportable
        WHERE user_id = v_user_id AND tipo = 'income'
          AND fecha >= v_f_inicio AND fecha <= v_f_fin;
        
        IF v_ingreso_mes = 0 THEN
            CONTINUE;
        END IF;
        
        SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_cons_nec
        FROM v_p_caja_reportable c
        INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'need'
          AND c.fecha >= v_f_inicio AND c.fecha <= v_f_fin;
        
        SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_cons_des
        FROM v_p_caja_reportable c
        INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'want'
          AND c.fecha >= v_f_inicio AND c.fecha <= v_f_fin;
        
        SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_cons_diezmo
        FROM v_p_caja_reportable c
        INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'tithe'
          AND c.fecha >= v_f_inicio AND c.fecha <= v_f_fin;
        
        v_cons_ahorro := v_ingreso_mes - (v_cons_nec + v_cons_des + v_cons_diezmo);
        
        v_evolucion := v_evolucion || jsonb_build_array(jsonb_build_object(
            'mes', to_char(v_mes, 'YYYY-MM'),
            'income', ROUND(v_ingreso_mes, 2),
            'necesidades_pct', ROUND((v_cons_nec / v_ingreso_mes) * 100, 2),
            'deseos_pct', ROUND((v_cons_des / v_ingreso_mes) * 100, 2),
            'diezmo_pct', ROUND((v_cons_diezmo / v_ingreso_mes) * 100, 2),
            'ahorro_pct', ROUND((v_cons_ahorro / v_ingreso_mes) * 100, 2)
        ));
    END LOOP;
    
    RETURN jsonb_build_object(
        'configuracion_ideal', jsonb_build_object(
            'necesidades', v_pct_nec_config,
            'deseos', v_pct_des_config,
            'ahorro', v_pct_ahorro_config,
            'diezmo', v_pct_diezmo_config
        ),
        'evolucion', v_evolucion
    );
END;
$function$;

-- fn_reporte_gasto_por_integrante(): 1 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_gasto_por_integrante()
 RETURNS TABLE(nombre_integrante text, total_gastado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_f_inicio date; v_f_fin date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);

    RETURN QUERY
    SELECT 
        COALESCE(gf.nombre, 'no_assigned')::text,
        SUM(c.valor_egreso)::numeric
    FROM v_p_caja_reportable c
    LEFT JOIN p_grupo_familiar gf ON c.familiar_id = gf.familiar_id
    WHERE c.user_id = v_user_id 
      AND c.tipo = 'expense'
      AND c.fecha >= v_f_inicio AND c.fecha <= v_f_fin
    GROUP BY gf.nombre
    ORDER BY SUM(c.valor_egreso) DESC;
END;
$function$;

-- fn_reporte_limite_seguro_deuda(): 2 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_limite_seguro_deuda()
 RETURNS TABLE(ingreso_mensual_promedio numeric, gastos_fijos_mensuales numeric, porcentaje_comprometido numeric, estado_alerta_key text, mensaje_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_ingreso numeric := 0;
    v_fijos numeric := 0;
    v_pct numeric := 0;
    v_estado text;
    v_mensaje text;
    v_f_inicio date;
    v_f_fin date;
    v_mes_truncado date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
    v_mes_truncado := date_trunc('month', v_f_inicio);

    SELECT COALESCE(SUM(valor_ingreso), 0) / 3.0 INTO v_ingreso
    FROM v_p_caja_reportable
    WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days';

    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_fijos
    FROM v_p_caja_reportable c
    JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id 
      AND c.tipo = 'expense'
      AND e.tipo_cupo = 'need'
      AND c.fecha BETWEEN v_f_inicio AND v_f_fin;

    v_fijos := v_fijos + COALESCE((
        SELECT SUM(monto_cuota) FROM p_compromisos_tarjeta
        WHERE user_id = v_user_id AND mes_periodo = v_mes_truncado
    ), 0);

    v_fijos := v_fijos + COALESCE((
        SELECT SUM(monto_cuota) FROM p_cuotas_detalle
        WHERE user_id = v_user_id AND pagado = false
          AND fecha_estimada_pago BETWEEN v_f_inicio AND v_f_fin
    ), 0);

    IF v_ingreso > 0 THEN
        v_pct := ROUND((v_fijos / v_ingreso) * 100, 2);
    END IF;

    IF v_pct > 60 THEN
        v_estado := 'state_critical';
        v_mensaje := 'alert_debt_critical';
    ELSIF v_pct > 45 THEN
        v_estado := 'state_warning';
        v_mensaje := 'alert_debt_warning';
    ELSE
        v_estado := 'state_safe';
        v_mensaje := 'alert_debt_healthy';
    END IF;

    RETURN QUERY SELECT v_ingreso, v_fijos, v_pct, v_estado, v_mensaje;
END;
$function$;

-- fn_reporte_proyeccion_presupuestaria(): 1 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_proyeccion_presupuestaria()
 RETURNS TABLE(mes_proyectado date, ingresos_estimados numeric, compromisos_tarjeta numeric, presupuestos_asignados numeric, disponible_proyectado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint; v_hogar_id bigint; v_ingreso_promedio numeric;
    v_i integer; v_mes date; v_compromisos numeric; v_presupuestos numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    SELECT COALESCE(SUM(valor_ingreso), 0) / 3.0 INTO v_ingreso_promedio
    FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days';
    IF v_ingreso_promedio IS NULL THEN v_ingreso_promedio := 0; END IF;

    FOR v_i IN 0..5 LOOP
        v_mes := date_trunc('month', CURRENT_DATE + (v_i || ' months')::interval);
        SELECT COALESCE(SUM(monto_cuota), 0) INTO v_compromisos FROM p_compromisos_tarjeta
        WHERE mes_periodo = v_mes AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND user_id IN (SELECT user_id FROM p_hogar_participantes WHERE hogar_id = v_hogar_id)));
        SELECT COALESCE(SUM(monto_limite), 0) INTO v_presupuestos FROM p_presupuestos
        WHERE mes_periodo = v_mes AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));

        mes_proyectado := v_mes;
        ingresos_estimados := v_ingreso_promedio;
        compromisos_tarjeta := v_compromisos;
        presupuestos_asignados := v_presupuestos;
        disponible_proyectado := v_ingreso_promedio - v_compromisos - v_presupuestos;
        RETURN NEXT;
    END LOOP;
END;
$function$;

-- fn_reporte_punto_equilibrio(): 4 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_punto_equilibrio()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint; v_hogar_id bigint; v_gastos_fijos_mensuales numeric := 0; v_pago_minimo_deudas numeric := 0;
    v_meta_minima_ahorro numeric := 0; v_punto_equilibrio numeric := 0; v_ingreso_promedio_actual numeric := 0;
    v_margen_maniobra numeric := 0; v_pct_ahorro_config numeric := 0; v_tendencia jsonb := '[]'::jsonb;
    v_mes date; v_f_inicio date; v_f_fin date; v_ingreso_mes numeric; v_punto_mes numeric; v_i int; v_veredicto text; v_mensaje_key text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    
    SELECT COALESCE(SUM(c.valor_egreso), 0) / 3.0 INTO v_gastos_fijos_mensuales FROM v_p_caja_reportable c
    INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo IN ('need', 'tithe') AND c.fecha >= CURRENT_DATE - INTERVAL '90 days';
    
    SELECT COALESCE((SELECT SUM(monto_cuota) / 3.0 FROM p_compromisos_tarjeta WHERE user_id = v_user_id AND mes_periodo >= date_trunc('month', CURRENT_DATE - INTERVAL '2 months')), 0) INTO v_pago_minimo_deudas;
    v_pago_minimo_deudas := v_pago_minimo_deudas + COALESCE((SELECT SUM(cd.monto_cuota) FROM p_cuotas_detalle cd WHERE cd.user_id = v_user_id AND cd.pagado = false AND cd.fecha_estimada_pago BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 month'), 0);
    
    SELECT COALESCE(porcentaje_ahorro, 0) INTO v_pct_ahorro_config FROM p_presupuestos_config WHERE user_id = v_user_id;
    SELECT COALESCE(SUM(valor_ingreso), 0) / 3.0 INTO v_ingreso_promedio_actual FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days';
    
    v_meta_minima_ahorro := v_ingreso_promedio_actual * (v_pct_ahorro_config / 100.0);
    v_punto_equilibrio := v_gastos_fijos_mensuales + v_pago_minimo_deudas + v_meta_minima_ahorro;
    v_margen_maniobra := v_ingreso_promedio_actual - v_punto_equilibrio;
    
    FOR v_i IN 1..3 LOOP
        v_mes := CURRENT_DATE - (v_i || ' months')::interval;
        SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(v_mes);
        v_mes := date_trunc('month', v_f_inicio); -- only for displaying in json array
        SELECT COALESCE(SUM(valor_ingreso), 0) INTO v_ingreso_mes FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= v_f_inicio AND fecha <= v_f_fin;
        SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_punto_mes FROM v_p_caja_reportable c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo IN ('need', 'tithe') AND c.fecha >= v_f_inicio AND c.fecha <= v_f_fin;
        v_punto_mes := v_punto_mes + COALESCE((SELECT SUM(monto_cuota) FROM p_compromisos_tarjeta WHERE user_id = v_user_id AND mes_periodo = v_mes), 0);
        v_tendencia := v_tendencia || jsonb_build_array(jsonb_build_object('mes', to_char(v_mes, 'YYYY-MM'), 'ingreso_real', ROUND(v_ingreso_mes, 2), 'punto_equilibrio', ROUND(v_punto_mes, 2), 'superavit_deficit', ROUND(v_ingreso_mes - v_punto_mes, 2)));
    END LOOP;
    
    IF v_margen_maniobra > v_punto_equilibrio * 0.2 THEN 
        v_veredicto := 'comfortable'; v_mensaje_key := 'msg_equilibrium_comfortable';
    ELSIF v_margen_maniobra > 0 THEN 
        v_veredicto := 'tight'; v_mensaje_key := 'msg_equilibrium_tight';
    ELSE 
        v_veredicto := 'deficit'; v_mensaje_key := 'msg_equilibrium_deficit';
    END IF;
    
    RETURN jsonb_build_object(
        'actual', jsonb_build_object('punto_equilibrio', ROUND(v_punto_equilibrio, 2), 'ingreso_promedio', ROUND(v_ingreso_promedio_actual, 2), 'margen_maniobra', ROUND(v_margen_maniobra, 2), 'desglose', jsonb_build_object('gastos_fijos', ROUND(v_gastos_fijos_mensuales, 2), 'pago_minimo_deudas', ROUND(v_pago_minimo_deudas, 2), 'meta_ahorro', ROUND(v_meta_minima_ahorro, 2))),
        'veredicto', v_veredicto,
        'mensaje_key', v_mensaje_key,
        'tendencia_3m', v_tendencia
    );
END;
$function$;

-- fn_reporte_top_fuentes_ingreso(text): 3 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_top_fuentes_ingreso(p_periodo text DEFAULT 'mes_actual'::text)
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
  FROM public.v_p_caja_reportable c
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
    FROM public.v_p_caja_reportable c
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
    FROM public.v_p_caja_reportable c
    WHERE c.tipo = 'income'
      AND c.fecha BETWEEN v_f_inicio AND v_f_fin
      AND c.user_id = v_user_id
      AND c.cuenta_ingreso_id IS NULL
  ) i2
  WHERE i2.total > 0
  ORDER BY 6 DESC;

END;
$function$;

