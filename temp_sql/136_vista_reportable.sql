-- 136: una sola definicion de "gasto real" para todos los reportes.
--
-- Contexto: comprar o vender dolares se guarda como dos filas (expense en pesos +
-- income en dolares) porque p_caja tiene una sola columna moneda y el trigger
-- fn_actualizar_saldo_billetera_integral rechaza tipo='transfer' entre monedas
-- distintas. Las dos patas quedan pegadas con metadata.transfer_double_insert = true.
-- Trece reportes sumaban esas patas como gasto e ingreso reales.
--
-- La regla vive una sola vez, aca. Los reportes leen de la vista.

CREATE OR REPLACE VIEW public.v_p_caja_reportable
WITH (security_invoker = true) AS
SELECT *
FROM public.p_caja
WHERE COALESCE(metadata->>'transfer_double_insert', 'false') <> 'true';

COMMENT ON VIEW public.v_p_caja_reportable IS
  'p_caja sin las patas de transferencia entre monedas (metadata.transfer_double_insert). Todo reporte que mida gasto o ingreso debe leer de aca.';

GRANT SELECT ON public.v_p_caja_reportable TO authenticated;

-- fn_reporte_resumen_cuadrantes__: 1 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_resumen_cuadrantes()
 RETURNS TABLE(cuadrante_key text, cantidad_subcuentas bigint, monto_total numeric, top_subcuentas jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_f_inicio date;
    v_f_fin date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto();

    RETURN QUERY
    WITH datos_bcg AS (
        SELECT
            e.estructura_id,
            e.nombre_cuenta,
            e.icono,
            COUNT(c.p_caja_id)::bigint AS frecuencia,
            COALESCE(e.utilidad_placer, 5)::smallint AS placer,
            COALESCE(e.flexibilidad_recorte, 5)::smallint AS flexibilidad,
            COALESCE(SUM(c.valor_egreso), 0)::numeric AS monto_total,
            CASE
                WHEN COUNT(c.p_caja_id) > 4 AND COALESCE(e.utilidad_placer, 5) > 5 THEN 'star'
                WHEN COUNT(c.p_caja_id) <= 4 AND COALESCE(e.utilidad_placer, 5) > 5 THEN 'cow'
                WHEN COUNT(c.p_caja_id) <= 4 AND COALESCE(e.utilidad_placer, 5) <= 5 THEN 'dilemma'
                ELSE 'dog'
            END AS cuadrante_key
        FROM v_p_caja_reportable c
        INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.user_id = v_user_id
          AND c.tipo = 'expense'
          AND c.fecha BETWEEN v_f_inicio AND v_f_fin
          AND (
            (e.padre_id IS NOT NULL)
            OR (e.padre_id IS NULL AND NOT EXISTS (
                SELECT 1 FROM p_estructuras_egresos hijo
                WHERE hijo.padre_id = e.estructura_id AND hijo.user_id = e.user_id
            ))
          )
        GROUP BY e.estructura_id, e.nombre_cuenta, e.icono, e.utilidad_placer, e.flexibilidad_recorte
    ),
    ranked AS (
        SELECT
            datos_bcg.cuadrante_key,
            datos_bcg.nombre_cuenta,
            datos_bcg.icono,
            datos_bcg.monto_total,
            ROW_NUMBER() OVER (PARTITION BY datos_bcg.cuadrante_key ORDER BY datos_bcg.monto_total DESC) AS rn
        FROM datos_bcg
        WHERE datos_bcg.monto_total > 0
    ),
    resumen AS (
        SELECT
            d.cuadrante_key,
            COUNT(*)::bigint AS cantidad,
            COALESCE(SUM(d.monto_total), 0)::numeric AS monto_acumulado
        FROM datos_bcg d
        GROUP BY d.cuadrante_key
    )
    SELECT
        r.cuadrante_key,
        r.cantidad,
        r.monto_acumulado,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'nombre', sub.nombre_cuenta,
                        'icono', sub.icono,
                        'monto', sub.monto_total
                    ) ORDER BY sub.monto_total DESC
                )
                FROM (
                    SELECT ranked.nombre_cuenta, ranked.icono, ranked.monto_total
                    FROM ranked
                    WHERE ranked.cuadrante_key = r.cuadrante_key
                      AND ranked.rn <= 3
                    ORDER BY ranked.monto_total DESC
                ) sub
            ),
            '[]'::jsonb
        ) AS top_3
    FROM resumen r
    ORDER BY CASE r.cuadrante_key
        WHEN 'dog' THEN 1
        WHEN 'star' THEN 2
        WHEN 'dilemma' THEN 3
        WHEN 'cow' THEN 4
    END;
END;
$function$;

-- fn_reporte_reto_buzon_deseos__: 2 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_reto_buzon_deseos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_f_inicio date; v_f_fin date; v_total_hormigas numeric := 0; v_buzon_id bigint; v_buzon_nombre text; v_buzon_saldo numeric; v_mensaje_key text;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto();

    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_total_hormigas FROM v_p_caja_reportable c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha BETWEEN v_f_inicio AND v_f_fin AND e.es_hormiga = true;

    SELECT billetera_id, nombre, saldo_actual INTO v_buzon_id, v_buzon_nombre, v_buzon_saldo FROM p_billeteras WHERE user_id = v_user_id AND es_fondo_prevision = true AND activa = true ORDER BY CASE WHEN nombre ILIKE '%buzón%' OR nombre ILIKE '%deseo%' THEN 0 ELSE 1 END, saldo_actual DESC LIMIT 1;

    IF v_total_hormigas = 0 THEN v_mensaje_key := 'msg_challenge_zero_ants';
    ELSIF v_buzon_id IS NULL THEN v_mensaje_key := 'msg_challenge_no_piggybank';
    ELSE v_mensaje_key := 'msg_challenge_transfer_to_piggybank'; END IF;

    RETURN jsonb_build_object(
        'total_hormigas_mes', ROUND(v_total_hormigas, 2),
        'cantidad_hormigas', (SELECT COUNT(*) FROM v_p_caja_reportable c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha BETWEEN v_f_inicio AND v_f_fin AND e.es_hormiga = true),
        'buzon_disponible', CASE WHEN v_buzon_id IS NOT NULL THEN true ELSE false END,
        'buzon_id', v_buzon_id, 'buzon_nombre', v_buzon_nombre, 'buzon_saldo_actual', v_buzon_saldo,
        'mensaje_key', v_mensaje_key
    );
END;
$function$;

-- fn_reporte_reto_hormigas__: 3 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_reto_hormigas()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_f_inicio date;
    v_f_fin date;
    v_total_hormigas_mes numeric := 0;
    v_cantidad_hormigas int := 0;
    v_buzon_id bigint;
    v_buzon_nombre text;
    v_buzon_saldo numeric;
    v_mes_anterior numeric := 0;
    v_mes_antepasado numeric := 0;
    v_tendencia_key text;
    v_mensaje_key text;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT hogar_id INTO v_hogar_id
    FROM p_hogar_participantes
    WHERE user_id = v_user_id;

    SELECT fecha_inicio, fecha_fin
    INTO v_f_inicio, v_f_fin
    FROM public.fn_obtener_fechas_ciclo_presupuesto();

    SELECT COALESCE(SUM(c.valor_egreso), 0), COUNT(c.p_caja_id)
    INTO v_total_hormigas_mes, v_cantidad_hormigas
    FROM v_p_caja_reportable c
    INNER JOIN p_estructuras_egresos e
        ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id
      AND c.tipo = 'expense'
      AND c.fecha BETWEEN v_f_inicio AND v_f_fin
      AND e.es_hormiga = true
      AND c.valor_egreso < 5000;

    SELECT COALESCE(SUM(c.valor_egreso), 0)
    INTO v_mes_anterior
    FROM v_p_caja_reportable c
    INNER JOIN p_estructuras_egresos e
        ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id
      AND c.tipo = 'expense'
      AND c.fecha BETWEEN (v_f_inicio - INTERVAL '1 month') AND (v_f_fin - INTERVAL '1 month')
      AND e.es_hormiga = true
      AND c.valor_egreso < 5000;

    SELECT COALESCE(SUM(c.valor_egreso), 0)
    INTO v_mes_antepasado
    FROM v_p_caja_reportable c
    INNER JOIN p_estructuras_egresos e
        ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id
      AND c.tipo = 'expense'
      AND c.fecha BETWEEN (v_f_inicio - INTERVAL '2 months') AND (v_f_fin - INTERVAL '2 months')
      AND e.es_hormiga = true
      AND c.valor_egreso < 5000;

    SELECT billetera_id, nombre, saldo_actual
    INTO v_buzon_id, v_buzon_nombre, v_buzon_saldo
    FROM p_billeteras
    WHERE user_id = v_user_id
      AND es_fondo_prevision = true
      AND activa = true
    ORDER BY
        CASE WHEN nombre ILIKE '%buzón%' OR nombre ILIKE '%deseo%' THEN 0 ELSE 1 END,
        saldo_actual DESC
    LIMIT 1;

    IF v_total_hormigas_mes < v_mes_anterior THEN
        v_tendencia_key := 'improving';
    ELSIF v_total_hormigas_mes > v_mes_anterior THEN
        v_tendencia_key := 'worsening';
    ELSE
        v_tendencia_key := 'stable';
    END IF;

    IF v_total_hormigas_mes = 0 THEN
        v_mensaje_key := 'msg_challenge_zero_ants';
    ELSIF v_buzon_id IS NULL THEN
        v_mensaje_key := 'msg_challenge_no_piggybank';
    ELSE
        v_mensaje_key := 'msg_challenge_transfer_to_piggybank';
    END IF;

    RETURN jsonb_build_object(
        'total_hormigas_mes', ROUND(v_total_hormigas_mes, 2),
        'cantidad_hormigas', v_cantidad_hormigas,
        'comparativa', jsonb_build_object(
            'mes_anterior', ROUND(v_mes_anterior, 2),
            'mes_antepasado', ROUND(v_mes_antepasado, 2),
            'tendencia_key', v_tendencia_key
        ),
        'buzon_disponible', CASE WHEN v_buzon_id IS NOT NULL THEN true ELSE false END,
        'buzon_id', v_buzon_id,
        'buzon_nombre', v_buzon_nombre,
        'buzon_saldo_actual', v_buzon_saldo,
        'proyeccion_6_meses', ROUND(v_total_hormigas_mes * 6, 2),
        'mensaje_key', v_mensaje_key
    );
END;
$function$;

-- fn_reporte_safe_to_spend__: 2 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_safe_to_spend()
 RETURNS TABLE(saldo_operativo numeric, blindaje_fijos_7d numeric, blindaje_deudas_7d numeric, capital_libre_semana numeric, dias_restantes_mes integer, safe_to_spend_diario numeric, umbral_deseo_diario numeric, estado_semaforo_key text, mensaje_sistema_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint; v_cotizacion_usd numeric; v_moneda_local text; v_saldo_operativo numeric := 0; v_gasto_nec_30d numeric := 0; v_gasto_des_30d numeric := 0;
    v_blindaje_fijos numeric := 0; v_blindaje_deudas numeric := 0; v_deudas_cuotas numeric := 0; v_deudas_tarjetas numeric := 0;
    v_capital_libre numeric := 0; v_dias_restantes int; v_safe_to_spend numeric := 0; v_umbral_deseo numeric := 0; v_estado text; v_mensaje_key text;
    v_f_inicio date; v_f_fin date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);

    -- La cotizacion que sirve es la del dolar EN LA MONEDA LOCAL del usuario, no la fila 'USD'
    -- (que vale 1 por definicion). Antes se leia 'USD' y los saldos en dolares se sumaban 1:1.
    SELECT r.moneda_default::text INTO v_moneda_local
    FROM p_config_region r WHERE r.user_id = v_user_id;

    SELECT p.valor_por_usd INTO v_cotizacion_usd
    FROM p_divisas p
    WHERE p.nombre = COALESCE(v_moneda_local, 'USD')
    ORDER BY p.ultima_actualizacion DESC LIMIT 1;
    v_cotizacion_usd := COALESCE(v_cotizacion_usd, 1.00);
    SELECT COALESCE(SUM(CASE WHEN moneda = 'USD' THEN saldo_actual * v_cotizacion_usd ELSE saldo_actual END), 0) INTO v_saldo_operativo FROM p_billeteras WHERE user_id = v_user_id AND es_fondo_prevision = false;
    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_gasto_nec_30d FROM v_p_caja_reportable c JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'need' AND c.fecha >= CURRENT_DATE - INTERVAL '30 days';
    SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_gasto_des_30d FROM v_p_caja_reportable c JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'want' AND c.fecha >= CURRENT_DATE - INTERVAL '30 days';

    v_blindaje_fijos := (v_gasto_nec_30d / 30.0) * 7.0; v_umbral_deseo := v_gasto_des_30d / 30.0;
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_deudas_cuotas FROM p_cuotas_detalle WHERE user_id = v_user_id AND pagado = false AND fecha_estimada_pago BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days';

    SELECT COALESCE(SUM(ct.monto_cuota), 0) INTO v_deudas_tarjetas
    FROM p_compromisos_tarjeta ct
    JOIN p_tarjetas_credito t ON ct.tarjeta_id = t.tarjeta_id
    WHERE ct.user_id = v_user_id
      AND ct.mes_periodo = date_trunc('month', CURRENT_DATE)
      AND t.dia_vencimiento IS NOT NULL
      AND (date_trunc('month', CURRENT_DATE) + ((t.dia_vencimiento - 1) * INTERVAL '1 day'))::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days';

    v_blindaje_deudas := v_deudas_cuotas + v_deudas_tarjetas;
    v_capital_libre := v_saldo_operativo - v_blindaje_fijos - v_blindaje_deudas;

    v_dias_restantes := (v_f_fin - CURRENT_DATE) + 1;
    IF v_dias_restantes <= 0 THEN v_dias_restantes := 1; END IF;

    IF v_capital_libre > 0 THEN v_safe_to_spend := v_capital_libre / v_dias_restantes; ELSE v_safe_to_spend := 0; END IF;

    IF v_safe_to_spend <= 0 THEN v_estado := 'red'; v_mensaje_key := 'msg_safe_to_spend_red';
    ELSIF v_safe_to_spend < v_umbral_deseo THEN v_estado := 'yellow'; v_mensaje_key := 'msg_safe_to_spend_yellow';
    ELSE v_estado := 'green'; v_mensaje_key := 'msg_safe_to_spend_green'; END IF;

    RETURN QUERY SELECT v_saldo_operativo, v_blindaje_fijos, v_blindaje_deudas, v_capital_libre, v_dias_restantes, v_safe_to_spend, v_umbral_deseo, v_estado, v_mensaje_key;
END;
$function$;

-- fn_reporte_simulador_escenarios__: 2 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_simulador_escenarios()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_escudo_base int;
    v_liquidez_total numeric;
    v_gastos_fijos_mensuales numeric;
    v_ingreso_mensual_promedio numeric;
    v_escudo_sin_ingreso int;
    v_escudo_gastos_20 int;
    v_escudo_emergencia int;
    v_emergencia_monto numeric := 100000;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF; -- ⭐ CORREGIDO

    SELECT dias_supervivencia_deuda_total INTO v_escudo_base FROM public.fn_reporte_escudo_tiempo() LIMIT 1;
    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_liquidez_total FROM p_billeteras WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false;
    SELECT COALESCE(SUM(monto_mensual), 0) INTO v_gastos_fijos_mensuales FROM p_gastos_fijos_config WHERE user_id = v_user_id AND es_fijo = true;

    IF v_gastos_fijos_mensuales = 0 THEN
        SELECT COALESCE(SUM(valor_egreso), 0) / 3.0 INTO v_gastos_fijos_mensuales
        FROM v_p_caja_reportable c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'necesidad' AND c.fecha >= CURRENT_DATE - INTERVAL '90 days';
    END IF;

    SELECT COALESCE(SUM(valor_ingreso), 0) / 3.0 INTO v_ingreso_mensual_promedio
    FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days';

    IF v_gastos_fijos_mensuales > 0 THEN v_escudo_sin_ingreso := ROUND((v_liquidez_total / v_gastos_fijos_mensuales) * 30); ELSE v_escudo_sin_ingreso := 0; END IF;
    IF (v_gastos_fijos_mensuales * 1.20) > 0 THEN v_escudo_gastos_20 := ROUND((v_liquidez_total / (v_gastos_fijos_mensuales * 1.20)) * 30); ELSE v_escudo_gastos_20 := 0; END IF;
    IF v_gastos_fijos_mensuales > 0 THEN
        v_escudo_emergencia := ROUND(((v_liquidez_total - v_emergencia_monto) / v_gastos_fijos_mensuales) * 30);
        IF v_escudo_emergencia < 0 THEN v_escudo_emergencia := 0; END IF;
    ELSE v_escudo_emergencia := 0; END IF;

    RETURN jsonb_build_object(
        'escenario_base', jsonb_build_object(
            'nombre_key', 'sim_scenario_current_state',
            'descripcion_key', 'sim_scenario_current_state_desc',
            'dias', v_escudo_base,
            'params', '{}'::jsonb
        ),
        'escenario_sin_ingreso', jsonb_build_object(
            'nombre_key', 'sim_scenario_loss_main_income',
            'descripcion_key', 'sim_scenario_loss_main_income_desc',
            'dias', v_escudo_sin_ingreso,
            'impacto', v_escudo_base - v_escudo_sin_ingreso,
            'params', jsonb_build_object('days', v_escudo_sin_ingreso)
        ),
        'escenario_gastos_20', jsonb_build_object(
            'nombre_key', 'sim_scenario_fixed_costs_up_20',
            'descripcion_key', 'sim_scenario_fixed_costs_up_20_desc',
            'dias', v_escudo_gastos_20,
            'impacto', v_escudo_base - v_escudo_gastos_20,
            'params', jsonb_build_object('days', v_escudo_gastos_20)
        ),
        'escenario_emergencia', jsonb_build_object(
            'nombre_key', 'sim_scenario_emergency',
            'descripcion_key', 'sim_scenario_emergency_desc',
            'dias', v_escudo_emergencia,
            'impacto', v_escudo_base - v_escudo_emergencia,
            'params', jsonb_build_object('amount', ROUND(v_emergencia_monto, 0), 'days', v_escudo_emergencia)
        ),
        'datos_base', jsonb_build_object('liquidez_total', ROUND(v_liquidez_total, 2), 'gastos_fijos_mensuales', ROUND(v_gastos_fijos_mensuales, 2), 'ingreso_mensual_promedio', ROUND(v_ingreso_mensual_promedio, 2))
    );
END;
$function$;

-- fn_reporte_simulador_impacto_numeric_integer_bigint_boolean_numeric_: 2 referencia(s)
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
              SELECT COALESCE(recargo_dolar_pct, 30.00) INTO v_impuesto_pct FROM p_tarjetas_credito WHERE tarjeta_id = p_tarjeta_id;
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
  $function$;

-- fn_reporte_sobres_detalle_date_: 3 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_sobres_detalle(p_mes_periodo date DEFAULT date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))
 RETURNS TABLE(estructura_id bigint, nombre_categoria text, icono text, color text, tipo_cupo text, padre_id bigint, monto_asignado numeric, monto_gastado numeric, monto_disponible numeric, arrastre_mes_anterior numeric, estado_sobre text, metodo_sobregasto text, monto_asignado_anterior numeric, monto_gastado_anterior numeric, gasto_promedio_6m numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_mes_truncado date := date_trunc('month', p_mes_periodo);
    v_mes_anterior date := v_mes_truncado - INTERVAL '1 month';
    v_f_inicio date;
    v_f_fin date;
    v_f_inicio_ant date;
    v_f_fin_ant date;
    v_dia_ancla int2;
    v_modo_presupuesto text;
    -- Ronda 7 (B2): cuando el usuario firmo el paso a base cero.
    v_fecha_activacion date;
    -- Desde que dia se cuentan los gastos del ciclo pedido.
    v_f_efectiva date;
    -- En base cero el arrastre no existe: cada ciclo arranca de cero.
    v_arrastre_cero boolean;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    SELECT dia_ancla_ciclo INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;
    IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;
    SELECT modo_presupuesto, fecha_activacion_base_cero
      INTO v_modo_presupuesto, v_fecha_activacion
      FROM p_presupuestos_config WHERE user_id = v_user_id;

    v_f_inicio := date_trunc('month', p_mes_periodo) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin := (v_f_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    v_f_inicio_ant := date_trunc('month', v_mes_anterior) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin_ant := (v_f_inicio_ant + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- B2/S2: base cero es un contrato con fecha. En base cero no hay arrastre en
    -- ningun ciclo (cada uno se asigna desde cero) y, en el ciclo en que el
    -- usuario se paso, los gastos se cuentan solo desde la activacion: los
    -- anteriores ya salieron de las billeteras y no se les puede pedir un sobre
    -- despues del hecho. Sin fecha de activacion no se inventa un corte: el
    -- gasto del ciclo se cuenta completo (usuarios anteriores a la columna).
    v_arrastre_cero := (v_modo_presupuesto = 'base_cero');
    v_f_efectiva := v_f_inicio;
    IF v_fecha_activacion IS NOT NULL AND v_fecha_activacion BETWEEN v_f_inicio AND v_f_fin THEN
        v_f_efectiva := v_fecha_activacion;
    END IF;

    RETURN QUERY
    WITH gastos_mes AS (
        SELECT c.estructura_egreso_id, SUM(c.valor_egreso) as total_gastado, BOOL_OR(c.tarjeta_id IS NOT NULL) as hay_tarjeta, BOOL_OR(c.tarjeta_id IS NULL AND c.tipo = 'expense') as hay_debito
        FROM v_p_caja_reportable c WHERE c.tipo = 'expense' AND c.fecha >= v_f_efectiva AND c.fecha <= v_f_fin
          AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
        GROUP BY c.estructura_egreso_id
    ),
    arrastres AS (
        SELECT e.estructura_id as estructura_egreso_id,
               COALESCE(p.monto_limite, 0) as monto_asignado_anterior,
               COALESCE(gm.total_gastado, 0) as monto_gastado_anterior,
               CASE WHEN v_arrastre_cero THEN 0
                    ELSE COALESCE(p.monto_limite, 0) - COALESCE(gm.total_gastado, 0) END as balance_mes_anterior
        FROM p_estructuras_egresos e
        LEFT JOIN p_presupuestos p ON e.estructura_id = p.estructura_egreso_id AND p.mes_periodo = v_mes_anterior AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
        LEFT JOIN LATERAL (
            SELECT SUM(valor_egreso) as total_gastado
            FROM v_p_caja_reportable
            WHERE estructura_egreso_id = e.estructura_id
              AND tipo = 'expense'
              AND fecha >= (date_trunc('month', v_mes_anterior) + ((COALESCE(p.dia_ancla, v_dia_ancla) - 1) * INTERVAL '1 day'))::date
              AND fecha <= ((date_trunc('month', v_mes_anterior) + ((COALESCE(p.dia_ancla, v_dia_ancla) - 1) * INTERVAL '1 day')) + INTERVAL '1 month' - INTERVAL '1 day')::date
              AND ((user_id = v_user_id AND es_compartido = false) OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id AND es_compartido = true))
        ) gm ON true
        WHERE (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
    ),
    -- Last 6 completed cycles (window k = [v_f_inicio - k months,
    -- v_f_inicio - (k-1) months - 1 day]); window 1 = the previous cycle.
    gastos_6m AS (
        SELECT agg.estructura_id as estructura_egreso_id,
               AVG(agg.gasto_mensual)::numeric AS gasto_promedio_6m
        FROM (
            SELECT e.estructura_id, g.i,
                   COALESCE((
                       SELECT SUM(c.valor_egreso)
                       FROM v_p_caja_reportable c
                       WHERE c.estructura_egreso_id = e.estructura_id
                         AND c.tipo = 'expense'
                         AND c.fecha >= (v_f_inicio - (g.i * INTERVAL '1 month'))::date
                         AND c.fecha <= (v_f_inicio - ((g.i - 1) * INTERVAL '1 month') - INTERVAL '1 day')::date
                         AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
                   ), 0) AS gasto_mensual
            FROM p_estructuras_egresos e
            CROSS JOIN generate_series(1, 6) AS g(i)
            WHERE (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
        ) agg
        WHERE agg.gasto_mensual > 0
        GROUP BY agg.estructura_id
    )
    SELECT e.estructura_id, e.nombre_cuenta::text, e.icono::text, e.color::text, COALESCE(padre.tipo_cupo, e.tipo_cupo)::text, e.padre_id,
           COALESCE(p.monto_limite, 0)::numeric, COALESCE(gm.total_gastado, 0)::numeric,
           (COALESCE(arr.balance_mes_anterior, 0) + COALESCE(p.monto_limite, 0) - COALESCE(gm.total_gastado, 0))::numeric,
           COALESCE(arr.balance_mes_anterior, 0)::numeric,
           CASE
               WHEN (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(arr.balance_mes_anterior, 0) END + COALESCE(p.monto_limite, 0)) = 0 AND COALESCE(gm.total_gastado, 0) = 0 THEN 'sin_movimiento'::text
               WHEN COALESCE(gm.total_gastado, 0) <= (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(arr.balance_mes_anterior, 0) END + COALESCE(p.monto_limite, 0)) * 0.70 THEN 'verde'::text
               WHEN COALESCE(gm.total_gastado, 0) <= (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(arr.balance_mes_anterior, 0) END + COALESCE(p.monto_limite, 0)) THEN 'amarillo_precaucion'::text
               ELSE 'rojo_excedido'::text
           END,
           CASE WHEN COALESCE(gm.total_gastado, 0) > (CASE WHEN v_modo_presupuesto = 'anticipado' THEN 0::numeric ELSE COALESCE(arr.balance_mes_anterior, 0) END + COALESCE(p.monto_limite, 0)) THEN
               CASE WHEN gm.hay_tarjeta AND NOT gm.hay_debito THEN 'credito'::text WHEN gm.hay_debito AND NOT gm.hay_tarjeta THEN 'debito'::text ELSE 'mixto'::text END
           ELSE NULL END,
           COALESCE(arr.monto_asignado_anterior, 0)::numeric,
           COALESCE(arr.monto_gastado_anterior, 0)::numeric,
           COALESCE(g6.gasto_promedio_6m, 0)::numeric
    FROM p_estructuras_egresos e
    LEFT JOIN p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
    LEFT JOIN p_presupuestos p ON e.estructura_id = p.estructura_egreso_id AND p.mes_periodo = v_mes_truncado AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
    LEFT JOIN gastos_mes gm ON e.estructura_id = gm.estructura_egreso_id
    LEFT JOIN arrastres arr ON e.estructura_id = arr.estructura_egreso_id
    LEFT JOIN gastos_6m g6 ON e.estructura_id = g6.estructura_egreso_id
    WHERE (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
      AND (e.padre_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM p_estructuras_egresos h WHERE h.padre_id = e.estructura_id))
    ORDER BY CASE COALESCE(padre.tipo_cupo, e.tipo_cupo) WHEN 'need' THEN 1 WHEN 'want' THEN 2 WHEN 'investment' THEN 3 WHEN 'saving' THEN 4 WHEN 'tithe' THEN 5 ELSE 6 END, COALESCE(gm.total_gastado, 0) DESC;
END;

$function$;

-- fn_reporte_termometro_presupuestos__: 5 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_termometro_presupuestos()
 RETURNS TABLE(cupo_nombre text, porcentaje_configurado numeric, monto_limite numeric, monto_consumido numeric, porcentaje_llenado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_hogar_id int8; v_ingreso_promedio_90 numeric := 0; v_pct_nec numeric; v_pct_des numeric; v_pct_ahorro numeric; v_pct_diezmo numeric; v_f_inicio date; v_f_fin date;
    v_cons_nec numeric; v_cons_des numeric; v_cons_diezmo numeric; v_lim_nec numeric; v_lim_des numeric; v_lim_ahorro numeric; v_lim_diezmo numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF; -- ⭐ CORREGIDO
    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;

    SELECT porcentaje_necesidades, porcentaje_deseos, porcentaje_ahorro, porcentaje_diezmo INTO v_pct_nec, v_pct_des, v_pct_ahorro, v_pct_diezmo FROM public.p_presupuestos_config WHERE user_id = v_user_id;
    IF NOT FOUND THEN v_pct_nec := 50; v_pct_des := 30; v_pct_ahorro := 20; v_pct_diezmo := 0; END IF;

    SELECT COALESCE(SUM(valor_ingreso), 0) / 3 INTO v_ingreso_promedio_90 FROM public.v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days';
    IF v_ingreso_promedio_90 = 0 THEN SELECT COALESCE(SUM(valor_ingreso), 0) INTO v_ingreso_promedio_90 FROM public.v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'income'; END IF;

    SELECT fecha_inicio, fecha_fin INTO v_f_inicio, v_f_fin FROM public.fn_obtener_fechas_ciclo_presupuesto();

    v_lim_nec    := ROUND((v_ingreso_promedio_90 * (v_pct_nec / 100)), 2);
    v_lim_des    := ROUND((v_ingreso_promedio_90 * (v_pct_des / 100)), 2);
    v_lim_diezmo := ROUND((v_ingreso_promedio_90 * (v_pct_diezmo / 100)), 2);
    v_lim_ahorro := ROUND((v_ingreso_promedio_90 * (v_pct_ahorro / 100)), 2);

    v_cons_nec    := COALESCE((SELECT SUM(c.valor_egreso) FROM public.v_p_caja_reportable c INNER JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.tipo = 'expense' AND e.tipo_cupo = 'necesidad' AND c.fecha BETWEEN v_f_inicio AND v_f_fin AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0);
    v_cons_des    := COALESCE((SELECT SUM(c.valor_egreso) FROM public.v_p_caja_reportable c INNER JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.tipo = 'expense' AND e.tipo_cupo = 'deseo' AND c.fecha BETWEEN v_f_inicio AND v_f_fin AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0);
    v_cons_diezmo := COALESCE((SELECT SUM(c.valor_egreso) FROM public.v_p_caja_reportable c INNER JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.tipo = 'expense' AND e.tipo_cupo = 'diezmo' AND c.fecha BETWEEN v_f_inicio AND v_f_fin AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0);

    RETURN QUERY
    -- ⭐ CORREGIDO: Nombres de cupos como claves i18n
    SELECT 'needs'::text, v_pct_nec::numeric, v_lim_nec::numeric, v_cons_nec::numeric, CASE WHEN v_lim_nec > 0 THEN ROUND((v_cons_nec / v_lim_nec) * 100, 2) ELSE 0::numeric END::numeric
    UNION ALL SELECT 'wants'::text, v_pct_des::numeric, v_lim_des::numeric, v_cons_des::numeric, CASE WHEN v_lim_des > 0 THEN ROUND((v_cons_des / v_lim_des) * 100, 2) ELSE 0::numeric END::numeric
    UNION ALL SELECT 'tithe'::text, v_pct_diezmo::numeric, v_lim_diezmo::numeric, v_cons_diezmo::numeric, CASE WHEN v_lim_diezmo > 0 THEN ROUND((v_cons_diezmo / v_lim_diezmo) * 100, 2) ELSE 0::numeric END::numeric
    UNION ALL SELECT 'savings_goal'::text, v_pct_ahorro::numeric, v_lim_ahorro::numeric, ROUND(v_ingreso_promedio_90 - (v_cons_nec + v_cons_des + v_cons_diezmo), 2)::numeric, CASE WHEN v_lim_ahorro > 0 THEN ROUND((ROUND(v_ingreso_promedio_90 - (v_cons_nec + v_cons_des + v_cons_diezmo), 2) / v_lim_ahorro) * 100, 2) ELSE 0::numeric END::numeric;
END;
$function$;

-- fn_reporte_termometro_presupuestos_date_: 4 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_termometro_presupuestos(p_mes_periodo date DEFAULT date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))
 RETURNS TABLE(cupo_nombre text, porcentaje_configurado numeric, monto_limite numeric, monto_consumido numeric, porcentaje_llenado numeric, estado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint; v_hogar_id int8;
    v_ingreso_ciclo numeric := 0;
    v_pct_nec numeric; v_pct_des numeric; v_pct_ahorro numeric; v_pct_diezmo numeric;
    v_f_inicio date; v_f_fin date;
    v_cons_nec numeric; v_cons_des numeric; v_cons_diezmo numeric; v_cons_ahorro numeric;
    v_dia_ancla int2;
    v_lim_nec numeric; v_lim_des numeric; v_lim_ahorro numeric; v_lim_diezmo numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;
    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;

    SELECT porcentaje_necesidades, porcentaje_deseos, porcentaje_ahorro, porcentaje_diezmo, dia_ancla_ciclo
      INTO v_pct_nec, v_pct_des, v_pct_ahorro, v_pct_diezmo, v_dia_ancla
    FROM public.p_presupuestos_config WHERE user_id = v_user_id;
    IF NOT FOUND THEN
        v_pct_nec := 50; v_pct_des := 30; v_pct_ahorro := 20; v_pct_diezmo := 0; v_dia_ancla := 1;
    END IF;
    IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;

    -- Ciclo del mes seleccionado (respeta dia_ancla_ciclo)
    v_f_inicio := date_trunc('month', p_mes_periodo) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin := (v_f_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- INGRESO REAL del ciclo (mismo scope que los gastos del ciclo)
    v_ingreso_ciclo := COALESCE((
        SELECT SUM(c.valor_ingreso) FROM public.v_p_caja_reportable c
        WHERE c.tipo = 'income' AND c.fecha BETWEEN v_f_inicio AND v_f_fin
          AND ((c.user_id = v_user_id AND c.es_compartido = false)
            OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0);

    -- Límite ideal del cupo = porcentaje definido × ingreso real del ciclo
    v_lim_nec    := ROUND((v_ingreso_ciclo * (v_pct_nec / 100)), 2);
    v_lim_des    := ROUND((v_ingreso_ciclo * (v_pct_des / 100)), 2);
    v_lim_diezmo := ROUND((v_ingreso_ciclo * (v_pct_diezmo / 100)), 2);
    v_lim_ahorro := ROUND((v_ingreso_ciclo * (v_pct_ahorro / 100)), 2);

    -- Consumo real por cupo, tipo_cupo heredado del padre
    v_cons_nec := COALESCE((SELECT SUM(c.valor_egreso) FROM public.v_p_caja_reportable c
        JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        LEFT JOIN public.p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
        WHERE c.tipo = 'expense' AND COALESCE(padre.tipo_cupo, e.tipo_cupo) = 'need'
          AND c.fecha BETWEEN v_f_inicio AND v_f_fin
          AND ((c.user_id = v_user_id AND c.es_compartido = false)
            OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0);

    v_cons_des := COALESCE((SELECT SUM(c.valor_egreso) FROM public.v_p_caja_reportable c
        JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        LEFT JOIN public.p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
        WHERE c.tipo = 'expense' AND COALESCE(padre.tipo_cupo, e.tipo_cupo) = 'want'
          AND c.fecha BETWEEN v_f_inicio AND v_f_fin
          AND ((c.user_id = v_user_id AND c.es_compartido = false)
            OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0);

    v_cons_diezmo := COALESCE((SELECT SUM(c.valor_egreso) FROM public.v_p_caja_reportable c
        JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        LEFT JOIN public.p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
        WHERE c.tipo = 'expense' AND COALESCE(padre.tipo_cupo, e.tipo_cupo) = 'tithe'
          AND c.fecha BETWEEN v_f_inicio AND v_f_fin
          AND ((c.user_id = v_user_id AND c.es_compartido = false)
            OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0);

    -- Ahorro: dinero real transferido a sobres de ahorro/inversión del ciclo
    -- (decisión previa del dueño: monto_limite asignado a esos cupos).
    v_cons_ahorro := COALESCE((SELECT SUM(p.monto_limite) FROM public.p_presupuestos p
        JOIN public.p_estructuras_egresos e ON p.estructura_egreso_id = e.estructura_id
        LEFT JOIN public.p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
        WHERE p.mes_periodo = date_trunc('month', p_mes_periodo)
          AND COALESCE(padre.tipo_cupo, e.tipo_cupo) IN ('saving', 'investment')
          AND (p.user_id = v_user_id
            OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))), 0);

    RETURN QUERY
    SELECT 'needs'::text, v_pct_nec, v_lim_nec, v_cons_nec,
           CASE WHEN v_lim_nec > 0 THEN ROUND((v_cons_nec / v_lim_nec) * 100, 2) ELSE 0::numeric END::numeric,
           CASE
               WHEN v_ingreso_ciclo = 0 THEN 'sin_datos'::text
               WHEN v_cons_nec > v_lim_nec THEN 'rojo_excedido'::text
               WHEN v_cons_nec > v_lim_nec * 0.70 THEN 'amarillo_precaucion'::text
               ELSE 'verde'::text
           END::text
    UNION ALL
    SELECT 'wants'::text, v_pct_des, v_lim_des, v_cons_des,
           CASE WHEN v_lim_des > 0 THEN ROUND((v_cons_des / v_lim_des) * 100, 2) ELSE 0::numeric END::numeric,
           CASE
               WHEN v_ingreso_ciclo = 0 THEN 'sin_datos'::text
               WHEN v_cons_des > v_lim_des THEN 'rojo_excedido'::text
               WHEN v_cons_des > v_lim_des * 0.70 THEN 'amarillo_precaucion'::text
               ELSE 'verde'::text
           END::text
    UNION ALL
    SELECT 'tithe'::text, v_pct_diezmo, v_lim_diezmo, v_cons_diezmo,
           CASE WHEN v_lim_diezmo > 0 THEN ROUND((v_cons_diezmo / v_lim_diezmo) * 100, 2) ELSE 0::numeric END::numeric,
           CASE
               WHEN v_ingreso_ciclo = 0 THEN 'sin_datos'::text
               WHEN v_cons_diezmo > v_lim_diezmo THEN 'rojo_excedido'::text
               WHEN v_cons_diezmo > v_lim_diezmo * 0.70 THEN 'amarillo_precaucion'::text
               ELSE 'verde'::text
           END::text
    UNION ALL
    SELECT 'savings_goal'::text, v_pct_ahorro, v_lim_ahorro, v_cons_ahorro,
           CASE WHEN v_lim_ahorro > 0 THEN ROUND((v_cons_ahorro / v_lim_ahorro) * 100, 2) ELSE 0::numeric END::numeric,
           CASE
               WHEN v_ingreso_ciclo = 0 THEN 'sin_datos'::text
               WHEN v_cons_ahorro < v_lim_ahorro * 0.50 THEN 'rojo_excedido'::text
               WHEN v_cons_ahorro < v_lim_ahorro * 0.90 THEN 'amarillo_precaucion'::text
               ELSE 'verde'::text
           END::text;
END;
$function$;

-- fn_reporte_termometro_tarjeta_bigint_: 3 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_termometro_tarjeta(p_tarjeta_id bigint)
 RETURNS TABLE(nombre_tarjeta text, indice_estres numeric, capacidad_pago_promedio numeric, saldo_actual_total numeric, cuota_proxima numeric, moneda_proxima text, fecha_proxima date, estado_alerta text, estado_mensaje text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Redefinicion 2026-10-14 (modelo acordado con el dueno):
--   capacidad_pago_promedio: ingreso promedio mensual (180d) - resto de gastos
--     promedio mensual (180d). "Resto" = tipo 'expense' con tarjeta_id NULL:
--     quedan afuera TODAS las tarjetas (compras, pagos de resumen, ajustes).
--   cuota_proxima: la cuota individual que antes vence (una, no la suma del
--     ciclo), con su moneda real y fecha estimada.
--   indice_estres: carga sostenida del plan de cuotas = total pendiente
--     equivalente a moneda local / meses restantes hasta la ultima cuota /
--     capacidad x 100. El resumen impago NO entra (ya se senala aparte en
--     vencimientos/alertas); sin cotizacion no se inventa: aviso honesto.
--   semaforo: verde <=30, amarillo 30-60, rojo >60; capacidad <= 0 -> rojo.
DECLARE
    v_user_id bigint; v_antiguedad int;
    v_ingreso_prom_180 numeric; v_gasto_no_card_prom_180 numeric;
    v_capacidad_prom numeric; v_saldo_total numeric; v_nombre text;
    v_mono_local text;
    v_equiv_pendiente numeric; v_cuotas_sin_tasa int; v_ultima_fecha date;
    v_meses_restantes numeric; v_indice numeric;
    v_fecha_proxima date; v_cuota_num numeric; v_cuota_mono text;
    v_suma_bruta numeric; v_todas_usd boolean;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT (CURRENT_DATE - MIN(fecha))::int INTO v_antiguedad FROM public.v_p_caja_reportable WHERE user_id = v_user_id;
    IF v_antiguedad < 30 OR v_antiguedad IS NULL THEN
        RETURN QUERY SELECT 'pending'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
            NULL::text, NULL::date, 'green'::text, 'msg_learning_data'::text;
        RETURN;
    END IF;

    SELECT t.nombre_tarjeta INTO v_nombre FROM public.p_tarjetas_credito t
      WHERE t.tarjeta_id = p_tarjeta_id AND t.user_id = v_user_id;
    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_saldo_total FROM public.p_billeteras WHERE user_id = v_user_id;

    SELECT COALESCE(SUM(valor_ingreso), 0) / 6 INTO v_ingreso_prom_180
      FROM public.v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'income'
        AND fecha >= CURRENT_DATE - INTERVAL '180 days';
    -- Gasto "resto": solo expenses sin tarjeta => excluye compras y pagos de
    -- TODAS las tarjetas (dos tarjetas: los gastos de la otra tampoco entran).
    SELECT COALESCE(SUM(valor_egreso), 0) / 6 INTO v_gasto_no_card_prom_180
      FROM public.v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'expense'
        AND tarjeta_id IS NULL AND fecha >= CURRENT_DATE - INTERVAL '180 days';
    v_capacidad_prom := v_ingreso_prom_180 - v_gasto_no_card_prom_180;

    SELECT moneda_default INTO v_mono_local FROM public.p_config_region WHERE user_id = v_user_id;
    v_mono_local := COALESCE(v_mono_local, 'ARS');

    -- Proximo total pendiente en equivalente moneda local (via helper honesto:
    -- identidade sin cotizacion; cruce con p_divisas; sin tasa -> NULL).
    SELECT COALESCE(SUM(P.monto_local), 0),
           count(*) FILTER (WHERE P.monto_local IS NULL),
           MAX(P.fecha_estimada_pago)
      INTO v_equiv_pendiente, v_cuotas_sin_tasa, v_ultima_fecha
    FROM (
        SELECT cd.monto_cuota, cd.moneda, cd.fecha_estimada_pago,
               (public.fn_valor_a_moneda_local(cd.monto_cuota, cd.moneda, v_user_id)).valor AS monto_local
        FROM public.p_cuotas_detalle cd
        WHERE cd.tarjeta_id = p_tarjeta_id AND cd.pagado = false
    ) P;

    -- Proximo pago de la tarjeta: TODAS las cuotas impagas que comparten la
    -- fecha estimada mas proxima (asi coincide con el estimado del resumen
    -- cuando todas caen el mismo dia). Moneda: USD si todas son USD; si no,
    -- equivalente en moneda local.
    SELECT MIN(cd.fecha_estimada_pago) INTO v_fecha_proxima
      FROM public.p_cuotas_detalle cd
      WHERE cd.tarjeta_id = p_tarjeta_id AND cd.pagado = false;

    IF v_fecha_proxima IS NOT NULL THEN
        SELECT COALESCE(SUM(P.monto_local), 0),
               COALESCE(SUM(P.monto_cuota), 0),
               COALESCE(bool_and(P.moneda = 'USD'), false)
          INTO v_cuota_num, v_suma_bruta, v_todas_usd
          FROM (
              SELECT cd.monto_cuota, cd.moneda,
                     (public.fn_valor_a_moneda_local(cd.monto_cuota, cd.moneda, v_user_id)).valor AS monto_local
              FROM public.p_cuotas_detalle cd
              WHERE cd.tarjeta_id = p_tarjeta_id AND cd.pagado = false
                AND cd.fecha_estimada_pago = v_fecha_proxima
          ) P;
        v_cuota_mono := CASE WHEN v_todas_usd AND v_mono_local <> 'USD' THEN 'USD' ELSE v_mono_local END;
        v_cuota_num := CASE WHEN v_todas_usd AND v_mono_local <> 'USD' THEN v_suma_bruta
                            ELSE v_cuota_num END;
    END IF;

    IF v_fecha_proxima IS NULL THEN
        RETURN QUERY SELECT v_nombre, 0::numeric, v_capacidad_prom, v_saldo_total,
            0::numeric, NULL::text, NULL::date, 'green'::text, 'msg_no_cuotas_pending'::text;
        RETURN;
    END IF;

    IF v_cuotas_sin_tasa > 0 THEN
        RETURN QUERY SELECT v_nombre, NULL::numeric, v_capacidad_prom, v_saldo_total,
            v_cuota_num, v_cuota_mono, v_fecha_proxima,
            'yellow'::text, 'msg_cotizacion_no_soportada'::text;
        RETURN;
    END IF;

    v_meses_restantes := GREATEST(1, ceil((v_ultima_fecha - CURRENT_DATE)::numeric / 30));
    v_indice := NULL;
    IF v_capacidad_prom > 0 THEN
        v_indice := ROUND((v_equiv_pendiente / v_meses_restantes / v_capacidad_prom) * 100, 1);
    END IF;

    IF v_capacidad_prom <= 0 THEN
        RETURN QUERY SELECT v_nombre, NULL::numeric, v_capacidad_prom, v_saldo_total,
            v_cuota_num, v_cuota_mono, v_fecha_proxima,
            'red'::text, 'msg_insufficient_balance_deficit'::text;
    ELSIF v_indice <= 30 THEN
        RETURN QUERY SELECT v_nombre, v_indice, v_capacidad_prom, v_saldo_total,
            v_cuota_num, v_cuota_mono, v_fecha_proxima,
            'green'::text, 'ok'::text;
    ELSIF v_indice <= 60 THEN
        RETURN QUERY SELECT v_nombre, v_indice, v_capacidad_prom, v_saldo_total,
            v_cuota_num, v_cuota_mono, v_fecha_proxima,
            'yellow'::text, 'msg_term_medium_quota'::text;
    ELSE
        RETURN QUERY SELECT v_nombre, v_indice, v_capacidad_prom, v_saldo_total,
            v_cuota_num, v_cuota_mono, v_fecha_proxima,
            'red'::text, 'msg_term_over_capacity'::text;
    END IF;
END;
$function$;

-- fn_reporte_timeline_proyeccion__: 2 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_timeline_proyeccion()
 RETURNS TABLE(mes_vencimiento text, total_tarjetas numeric, total_prestamos numeric, total_mes_comprometido numeric, capacidad_techo_promedio numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint; v_ingreso_prom_180 numeric; v_gasto_fijo_prom_180 numeric; v_capacidad_techo numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF; -- ⭐ CORREGIDO

    SELECT COALESCE(SUM(valor_ingreso), 0) / 6 INTO v_ingreso_prom_180 FROM public.v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '180 days';
    SELECT COALESCE(SUM(valor_egreso), 0) / 6 INTO v_gasto_fijo_prom_180 FROM public.v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= CURRENT_DATE - INTERVAL '180 days';

    v_capacidad_techo := v_ingreso_prom_180 - v_gasto_fijo_prom_180;
    IF v_capacidad_techo < 0 THEN v_capacidad_techo := 0; END IF;

    RETURN QUERY
    WITH serie_meses AS (SELECT to_char(generate_series(date_trunc('month', CURRENT_DATE), date_trunc('month', CURRENT_DATE + INTERVAL '11 months'), INTERVAL '1 month'), 'YYYY-MM') AS año_mes)
    SELECT s.año_mes::text AS mes_vencimiento,
           COALESCE(SUM(CASE WHEN cd.tarjeta_id IS NOT NULL THEN cd.monto_cuota ELSE 0 END), 0)::numeric AS total_tarjetas,
           COALESCE(SUM(CASE WHEN cd.prestamo_id IS NOT NULL THEN cd.monto_cuota ELSE 0 END), 0)::numeric AS total_prestamos,
           COALESCE(SUM(cd.monto_cuota), 0)::numeric AS total_mes_comprometido,
           v_capacidad_techo::numeric AS capacidad_techo_promedio
    FROM serie_meses s
    LEFT JOIN public.p_cuotas_detalle cd ON to_char(cd.fecha_estimada_pago, 'YYYY-MM') = s.año_mes AND cd.user_id = v_user_id AND cd.pagado = false
    LEFT JOIN public.p_prestamos pr ON cd.prestamo_id = pr.prestamo_id
    WHERE (pr.prestamo_id IS NULL OR pr.tipo_flujo = 'debo')
    GROUP BY s.año_mes ORDER BY s.año_mes ASC;
END;
$function$;

-- fn_reporte_variacion_intermensual__: 5 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_reporte_variacion_intermensual()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint; v_hogar_id bigint;
    v_mes_anterior date; v_mes_antepasado date;
    v_f_inicio_act date; v_f_fin_act date;
    v_f_inicio_ant date; v_f_fin_ant date;
    v_f_inicio_antep date; v_f_fin_antep date;
    v_total_actual numeric := 0; v_total_anterior numeric := 0; v_total_antepasado numeric := 0;
    v_variacion_1m numeric := 0; v_variacion_3m numeric := 0;
    v_top_subidas jsonb; v_top_bajadas jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio_act, v_f_fin_act FROM public.fn_obtener_fechas_ciclo_presupuesto(CURRENT_DATE);
    v_mes_anterior := v_f_inicio_act - INTERVAL '10 days';
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio_ant, v_f_fin_ant FROM public.fn_obtener_fechas_ciclo_presupuesto(v_mes_anterior);
    v_mes_antepasado := v_f_inicio_ant - INTERVAL '10 days';
    SELECT fecha_inicio, fecha_fin INTO v_f_inicio_antep, v_f_fin_antep FROM public.fn_obtener_fechas_ciclo_presupuesto(v_mes_antepasado);
    
    SELECT COALESCE(SUM(valor_egreso), 0) INTO v_total_actual FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= v_f_inicio_act AND fecha <= v_f_fin_act;
    SELECT COALESCE(SUM(valor_egreso), 0) INTO v_total_anterior FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= v_f_inicio_ant AND fecha <= v_f_fin_ant;
    SELECT COALESCE(SUM(valor_egreso), 0) INTO v_total_antepasado FROM v_p_caja_reportable WHERE user_id = v_user_id AND tipo = 'expense' AND fecha >= v_f_inicio_antep AND fecha <= v_f_fin_antep;
    
    IF v_total_anterior > 0 THEN v_variacion_1m := ((v_total_actual - v_total_anterior) / v_total_anterior) * 100; END IF;
    IF v_total_antepasado > 0 THEN v_variacion_3m := ((v_total_actual - ((v_total_anterior + v_total_antepasado) / 2.0)) / ((v_total_anterior + v_total_antepasado) / 2.0)) * 100; END IF;
    
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.variacion_abs DESC), '[]'::jsonb) INTO v_top_subidas
    FROM (SELECT e.nombre_cuenta AS categoria, e.icono, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) AS mes_actual, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) AS mes_anterior, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) AS variacion_abs, CASE WHEN COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) > 0 THEN ROUND(((COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0)) / COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 1)) * 100, 2) ELSE 0 END AS variacion_pct FROM v_p_caja_reportable c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha >= v_f_inicio_ant GROUP BY e.estructura_id, e.nombre_cuenta, e.icono HAVING COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) > 0 ORDER BY variacion_abs DESC LIMIT 5) t;
    
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.variacion_abs ASC), '[]'::jsonb) INTO v_top_bajadas
    FROM (SELECT e.nombre_cuenta AS categoria, e.icono, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) AS mes_actual, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) AS mes_anterior, COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) AS variacion_abs, CASE WHEN COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) > 0 THEN ROUND(((COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0)) / COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 1)) * 100, 2) ELSE 0 END AS variacion_pct FROM v_p_caja_reportable c INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND c.fecha >= v_f_inicio_ant GROUP BY e.estructura_id, e.nombre_cuenta, e.icono HAVING COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_act THEN c.valor_egreso ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN c.fecha >= v_f_inicio_ant AND c.fecha <= v_f_fin_ant THEN c.valor_egreso ELSE 0 END), 0) < 0 ORDER BY variacion_abs ASC LIMIT 5) t;
    
    RETURN jsonb_build_object(
        'totales', jsonb_build_object('mes_actual', ROUND(v_total_actual, 2), 'mes_anterior', ROUND(v_total_anterior, 2), 'mes_antepasado', ROUND(v_total_antepasado, 2)),
        'variaciones', jsonb_build_object('vs_mes_anterior_pct', ROUND(v_variacion_1m, 2), 'vs_promedio_3m_pct', ROUND(v_variacion_3m, 2)),
        'top_subidas', v_top_subidas, 'top_bajadas', v_top_bajadas,
        'insight', CASE 
            WHEN v_variacion_1m > 20 THEN 'insight_expenses_up'
            WHEN v_variacion_1m < -10 THEN 'insight_expenses_down'
            ELSE 'insight_expenses_stable'
        END
    );
END;
$function$;

-- fn_sugerir_distribucion_activacion__: 2 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_sugerir_distribucion_activacion()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_liquidez_actual numeric := 0;
    v_pct_nec numeric;
    v_pct_des numeric;
    v_pct_aho numeric;
    v_pct_diez numeric;
    v_sugerencias jsonb := '[]'::jsonb;
    v_meses_activos numeric := 1.0;
    r_cat RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    -- Calcular el número de meses activos con transacciones en los últimos 90 días (máximo 3, mínimo 1)
    SELECT COALESCE(NULLIF(COUNT(DISTINCT date_trunc('month', c.fecha)), 0), 1)::numeric
    INTO v_meses_activos
    FROM v_p_caja_reportable c
    WHERE (c.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id))
      AND c.tipo = 'expense'
      AND c.fecha >= CURRENT_DATE - INTERVAL '90 days';

    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_liquidez_actual
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false;

    SELECT porcentaje_necesidades, porcentaje_deseos, porcentaje_ahorro, porcentaje_diezmo
    INTO v_pct_nec, v_pct_des, v_pct_aho, v_pct_diez
    FROM p_presupuestos_config WHERE user_id = v_user_id;

    IF v_pct_nec IS NULL THEN
        v_pct_nec := 50; v_pct_des := 30; v_pct_aho := 20; v_pct_diez := 0;
    END IF;

    BEGIN
        FOR r_cat IN 
            SELECT e.estructura_id, e.nombre_cuenta, COALESCE(padre.tipo_cupo, e.tipo_cupo) AS tipo_cupo_efectivo,
                   COALESCE((
                       SELECT SUM(valor_egreso) 
                       FROM v_p_caja_reportable c 
                       WHERE c.estructura_egreso_id = e.estructura_id
                         AND c.tipo = 'expense'
                         AND c.fecha >= CURRENT_DATE - INTERVAL '90 days'
                         AND (c.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id))
                   ), 0) / v_meses_activos AS promedio_3m
            FROM p_estructuras_egresos e
            LEFT JOIN p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
            WHERE (e.padre_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM p_estructuras_egresos h WHERE h.padre_id = e.estructura_id))
              AND (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id))
              AND COALESCE(padre.tipo_cupo, e.tipo_cupo) IS NOT NULL
              AND LOWER(e.nombre_cuenta) NOT IN ('cat_mystery', 'cat_misterio', 'misterio', 'olvido')
        LOOP
            v_sugerencias := v_sugerencias || jsonb_build_object(
                'estructura_id', r_cat.estructura_id,
                'nombre', r_cat.nombre_cuenta,
                'tipo_cupo', r_cat.tipo_cupo_efectivo,
                'monto_sugerido', ROUND(r_cat.promedio_3m, 2)
            );
        END LOOP;
    END;

    RETURN jsonb_build_object(
        'liquidez_actual', v_liquidez_actual,
        'reglas_oro', jsonb_build_object(
            'necesidades', v_pct_nec,
            'deseos', v_pct_des,
            'ahorro_inversion', v_pct_aho,
            'diezmo', v_pct_diez
        ),
        'sugerencias', v_sugerencias,
        'mensaje_ux_key', 'suggestion_ux_message'
    );
END;
$function$;

-- fn_telemetry_refresh_user_metrics__: 3 referencia(s)
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
    FROM public.v_p_caja_reportable
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
    FROM public.v_p_caja_reportable
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
    FROM public.v_p_caja_reportable
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

-- fn_transferir_entre_sobres_bigint_bigint_numeric_date_: 2 referencia(s)
CREATE OR REPLACE FUNCTION public.fn_transferir_entre_sobres(p_origen_id bigint, p_destino_id bigint, p_monto numeric, p_mes_periodo date DEFAULT date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_disponible_origen numeric;
    v_mes_truncado date := date_trunc('month', p_mes_periodo);
    v_f_inicio date;
    v_f_fin date;
    v_dia_ancla int2;
    v_mes_anterior date := v_mes_truncado - INTERVAL '1 month';
    v_f_inicio_ant date;
    v_f_fin_ant date;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;

    IF p_monto <= 0 THEN
        RAISE EXCEPTION '{"key": "error_amount_must_be_positive", "params": {}}';
    END IF;

    IF p_origen_id = p_destino_id THEN
        RAISE EXCEPTION '{"key": "error_cannot_transfer_to_same_envelope", "params": {}}';
    END IF;

    SELECT dia_ancla INTO v_dia_ancla
    FROM public.p_presupuestos
    WHERE user_id = v_user_id AND mes_periodo = v_mes_truncado
    LIMIT 1;

    IF v_dia_ancla IS NULL THEN
        SELECT dia_ancla_ciclo INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;
        IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;
    END IF;

    v_f_inicio := date_trunc('month', p_mes_periodo) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin := (v_f_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    v_f_inicio_ant := date_trunc('month', v_mes_anterior) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin_ant := (v_f_inicio_ant + INTERVAL '1 month' - INTERVAL '1 day')::date;

    SELECT 
        (
            COALESCE((SELECT monto_limite FROM p_presupuestos p2 WHERE p2.estructura_egreso_id = p_origen_id AND p2.mes_periodo = v_mes_anterior AND (p2.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p2.hogar_id = v_hogar_id))), 0) -
            COALESCE((SELECT SUM(valor_egreso) FROM v_p_caja_reportable c WHERE c.estructura_egreso_id = p_origen_id AND c.tipo = 'expense' AND c.fecha BETWEEN v_f_inicio_ant AND v_f_fin_ant AND ((c.user_id = v_user_id AND c.es_compartido = false) OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0)
        ) + COALESCE(p.monto_limite, 0) - COALESCE((
            SELECT SUM(valor_egreso) FROM v_p_caja_reportable c
            WHERE c.estructura_egreso_id = p_origen_id
              AND c.tipo = 'expense'
              AND c.fecha BETWEEN v_f_inicio AND v_f_fin
              AND ((c.user_id = v_user_id AND c.es_compartido = false) 
                   OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))
        ), 0) INTO v_disponible_origen
    FROM p_estructuras_egresos e
    LEFT JOIN p_presupuestos p ON e.estructura_id = p.estructura_egreso_id 
        AND p.mes_periodo = v_mes_truncado 
        AND (p.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND p.hogar_id = v_hogar_id))
    WHERE e.estructura_id = p_origen_id 
      AND (e.user_id = v_user_id OR (v_hogar_id IS NOT NULL AND e.hogar_id = v_hogar_id));

    IF v_disponible_origen IS NULL OR v_disponible_origen < p_monto THEN
        RAISE EXCEPTION '{"key": "error_insufficient_funds_in_envelope", "params": {}}';
    END IF;

    UPDATE p_presupuestos
    SET monto_limite = monto_limite - p_monto
    WHERE estructura_egreso_id = p_origen_id 
      AND mes_periodo = v_mes_truncado
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));

    INSERT INTO p_presupuestos (
        user_id, hogar_id, estructura_egreso_id, mes_periodo, monto_limite, dia_ancla
    )
    SELECT v_user_id, v_hogar_id, p_destino_id, v_mes_truncado, p_monto, v_dia_ancla
    WHERE EXISTS (SELECT 1 FROM p_estructuras_egresos WHERE estructura_id = p_destino_id)
    ON CONFLICT (estructura_egreso_id, mes_periodo, user_id, COALESCE(hogar_id, 0)) 
    DO UPDATE SET monto_limite = p_presupuestos.monto_limite + EXCLUDED.monto_limite;
END;
$function$;

