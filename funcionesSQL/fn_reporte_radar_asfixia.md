CREATE OR REPLACE FUNCTION public.fn_reporte_radar_asfixia()
 RETURNS TABLE(dia date, saldo_proyectado numeric, ingreso_esperado numeric, egreso_tarjeta numeric, egreso_tarjeta_usd numeric, egreso_goteo numeric, estado_dia text, evento_texto text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_saldo_inicial numeric := 0;
    v_dia_cobro int := NULL;
    v_monto_cobro numeric := 0;
    v_goteo_diario numeric := 0;
    v_colchon_minimo numeric := 0;
    v_dia_ancla int2;
    v_moneda_local text;
    v_cot numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(dia_ancla_ciclo, 1) INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;

    SELECT COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS')
      INTO v_moneda_local;
    SELECT (SELECT valor_por_usd FROM public.p_divisas WHERE nombre = v_moneda_local
             ORDER BY ultima_actualizacion DESC LIMIT 1)
      INTO v_cot;

    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_saldo_inicial
    FROM p_billeteras WHERE user_id = v_user_id AND es_fondo_prevision = false;

    SELECT EXTRACT(DAY FROM fecha)::int, COALESCE(AVG(valor_ingreso), 0)
    INTO v_dia_cobro, v_monto_cobro
    FROM (
        SELECT fecha, SUM(valor_ingreso) as valor_ingreso
        FROM p_caja
        WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY fecha
    ) sub
    GROUP BY EXTRACT(DAY FROM fecha)
    ORDER BY SUM(valor_ingreso) DESC LIMIT 1;

    SELECT COALESCE(SUM(c.valor_egreso), 0) / 90.0 INTO v_goteo_diario
    FROM p_caja c
    JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'need' AND c.fecha >= CURRENT_DATE - INTERVAL '90 days';

    v_colchon_minimo := v_goteo_diario * 3;

    RETURN QUERY
    WITH dias AS (
        SELECT generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '29 days', '1 day')::date AS dia
    ),
    ingresos AS (
        SELECT d.dia,
               CASE WHEN EXTRACT(DAY FROM d.dia) = v_dia_cobro THEN v_monto_cobro ELSE 0 END as ingreso
        FROM dias d
    ),
    golpes_tarjetas AS (
        SELECT d.dia,
               COALESCE(SUM(COALESCE(ct.monto_cuota, 0)), 0)
                 + COALESCE(SUM(CASE WHEN cd.moneda = v_moneda_local OR cd.moneda IS NULL THEN cd.monto_cuota ELSE 0 END), 0)
                 + COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0) * COALESCE(v_cot, 0) as egreso_t,
               COALESCE(SUM(CASE WHEN cd.moneda = 'USD' THEN cd.monto_cuota ELSE 0 END), 0) as egreso_t_usd,
               STRING_AGG(DISTINCT t.nombre_tarjeta, ', ') as tarjetas
        FROM dias d
        JOIN p_tarjetas_credito t ON EXTRACT(DAY FROM d.dia) = t.dia_vencimiento
        LEFT JOIN p_compromisos_tarjeta ct ON t.tarjeta_id = ct.tarjeta_id AND ct.mes_periodo = date_trunc('month',
            (CASE
                WHEN EXTRACT(DAY FROM d.dia) >= v_dia_ancla THEN date_trunc('month', d.dia) + ((v_dia_ancla - 1) * INTERVAL '1 day')
                ELSE (date_trunc('month', d.dia) - INTERVAL '1 month') + ((v_dia_ancla - 1) * INTERVAL '1 day')
            END) + INTERVAL '1 month' - INTERVAL '1 day'
        )::date
        LEFT JOIN p_cuotas_detalle cd ON t.tarjeta_id = cd.tarjeta_id AND cd.fecha_estimada_pago = d.dia AND cd.pagado = false
        WHERE t.user_id = v_user_id AND (ct.monto_cuota IS NOT NULL OR cd.monto_cuota IS NOT NULL)
        GROUP BY d.dia
    )
    SELECT
        d.dia,
        (v_saldo_inicial +
         SUM(i.ingreso) OVER (ORDER BY d.dia) -
         SUM(COALESCE(gt.egreso_t, 0) + v_goteo_diario) OVER (ORDER BY d.dia)
        )::numeric,
        i.ingreso::numeric,
        COALESCE(gt.egreso_t, 0)::numeric,
        COALESCE(gt.egreso_t_usd, 0)::numeric,
        v_goteo_diario::numeric,
        CASE
            WHEN (v_saldo_inicial + SUM(i.ingreso) OVER (ORDER BY d.dia) - SUM(COALESCE(gt.egreso_t, 0) + v_goteo_diario) OVER (ORDER BY d.dia)) < 0 THEN 'red'
            WHEN (v_saldo_inicial + SUM(i.ingreso) OVER (ORDER BY d.dia) - SUM(COALESCE(gt.egreso_t, 0) + v_goteo_diario) OVER (ORDER BY d.dia)) < v_colchon_minimo THEN 'yellow'
            ELSE 'green'
        END,
        CASE
            WHEN i.ingreso > 0 AND COALESCE(gt.egreso_t, 0) > 0 THEN 'tooltip_income_and_debt'
            WHEN i.ingreso > 0 THEN 'tooltip_income_expected'
            WHEN COALESCE(gt.egreso_t, 0) > 0 THEN 'tooltip_debt_due'
            ELSE NULL
        END
    FROM dias d
    JOIN ingresos i ON d.dia = i.dia
    LEFT JOIN golpes_tarjetas gt ON d.dia = gt.dia
    ORDER BY d.dia;
END;
$function$;
DECLARE
    v_user_id bigint;
    v_saldo_inicial numeric := 0;
    v_dia_cobro int := NULL;
    v_monto_cobro numeric := 0;
    v_goteo_diario numeric := 0;
    v_colchon_minimo numeric := 0;
    v_dia_ancla int2;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(dia_ancla_ciclo, 1) INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;

    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_saldo_inicial
    FROM p_billeteras WHERE user_id = v_user_id AND es_fondo_prevision = false;

    SELECT EXTRACT(DAY FROM fecha)::int, COALESCE(AVG(valor_ingreso), 0)
    INTO v_dia_cobro, v_monto_cobro
    FROM (
        SELECT fecha, SUM(valor_ingreso) as valor_ingreso
        FROM p_caja
        WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY fecha
    ) sub
    GROUP BY EXTRACT(DAY FROM fecha)
    ORDER BY SUM(valor_ingreso) DESC LIMIT 1;

    SELECT COALESCE(SUM(c.valor_egreso), 0) / 90.0 INTO v_goteo_diario
    FROM p_caja c
    JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
    WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'need' AND c.fecha >= CURRENT_DATE - INTERVAL '90 days';
    
    v_colchon_minimo := v_goteo_diario * 3;

    RETURN QUERY
    WITH dias AS (
        SELECT generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '29 days', '1 day')::date AS dia
    ),
    ingresos AS (
        SELECT d.dia, 
               CASE WHEN EXTRACT(DAY FROM d.dia) = v_dia_cobro THEN v_monto_cobro ELSE 0 END as ingreso
        FROM dias d
    ),
    golpes_tarjetas AS (
        -- FIX Fase 7: ct.monto_cuota y cd.monto_cuota — calificar alias
        SELECT d.dia,
               COALESCE(SUM(COALESCE(ct.monto_cuota, 0) + COALESCE(cd.monto_cuota, 0)), 0) as egreso_t,
               STRING_AGG(DISTINCT t.nombre_tarjeta, ', ') as tarjetas
        FROM dias d
        JOIN p_tarjetas_credito t ON EXTRACT(DAY FROM d.dia) = t.dia_vencimiento
        LEFT JOIN p_compromisos_tarjeta ct ON t.tarjeta_id = ct.tarjeta_id AND ct.mes_periodo = date_trunc('month', 
            (CASE 
                WHEN EXTRACT(DAY FROM d.dia) >= v_dia_ancla THEN date_trunc('month', d.dia) + ((v_dia_ancla - 1) * INTERVAL '1 day')
                ELSE (date_trunc('month', d.dia) - INTERVAL '1 month') + ((v_dia_ancla - 1) * INTERVAL '1 day')
            END) + INTERVAL '1 month' - INTERVAL '1 day'
        )::date
        LEFT JOIN p_cuotas_detalle cd ON t.tarjeta_id = cd.tarjeta_id AND cd.fecha_estimada_pago = d.dia AND cd.pagado = false
        WHERE t.user_id = v_user_id AND (ct.monto_cuota IS NOT NULL OR cd.monto_cuota IS NOT NULL)
        GROUP BY d.dia
    )
    SELECT 
        d.dia,
        (v_saldo_inicial + 
         SUM(i.ingreso) OVER (ORDER BY d.dia) - 
         SUM(COALESCE(gt.egreso_t, 0) + v_goteo_diario) OVER (ORDER BY d.dia)
        )::numeric,
        i.ingreso::numeric,
        COALESCE(gt.egreso_t, 0)::numeric,
        v_goteo_diario::numeric,
        CASE 
            WHEN (v_saldo_inicial + SUM(i.ingreso) OVER (ORDER BY d.dia) - SUM(COALESCE(gt.egreso_t, 0) + v_goteo_diario) OVER (ORDER BY d.dia)) < 0 THEN 'red'
            WHEN (v_saldo_inicial + SUM(i.ingreso) OVER (ORDER BY d.dia) - SUM(COALESCE(gt.egreso_t, 0) + v_goteo_diario) OVER (ORDER BY d.dia)) < v_colchon_minimo THEN 'yellow'
            ELSE 'green'
        END,
        CASE 
            WHEN i.ingreso > 0 AND COALESCE(gt.egreso_t, 0) > 0 THEN 'tooltip_income_and_debt'
            WHEN i.ingreso > 0 THEN 'tooltip_income_expected'
            WHEN COALESCE(gt.egreso_t, 0) > 0 THEN 'tooltip_debt_due'
            ELSE NULL
        END
    FROM dias d
    JOIN ingresos i ON d.dia = i.dia
    LEFT JOIN golpes_tarjetas gt ON d.dia = gt.dia
    ORDER BY d.dia;
END;
$function$;

