-- 153: T2 - los totales dejan de contar dos veces cuando un rubro padre tiene presupuesto.
--
-- Regla unica (S15 de odd/tasks/presupuestos-padres.md): una fila de p_presupuestos cuenta
-- salvo que su rubro sea hijo de un rubro con presupuesto mayor a cero en el mismo ciclo y
-- para el mismo usuario. En ese caso la asignacion del hijo es una porcion del padre y
-- contarla aparte restaria dos veces la misma plata.
--
-- Sin presupuestos de padre cargados el predicado es siempre verdadero: el comportamiento
-- no cambia. Eso verifica el deploy comparando antes y despues.


-- 1) fn_obtener_saldo_disponible_para_asignar
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
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))
        AND NOT EXISTS (
          SELECT 1 FROM public.p_estructuras_egresos ee
          JOIN public.p_presupuestos pp ON pp.estructura_egreso_id = ee.padre_id
          WHERE ee.estructura_id = p_presupuestos.estructura_egreso_id
            AND pp.mes_periodo = p_presupuestos.mes_periodo
            AND pp.user_id = p_presupuestos.user_id
            AND COALESCE(pp.monto_limite, 0) > 0
        )
      ;

    -- 3. Total cuotas de tarjeta que vencen este mes
    -- p_compromisos_tarjeta no tiene columna hogar_id (sus columnas son
    -- compromiso_id, tarjeta_id, user_id, monto_cuota, mes_periodo, pagado,
    -- creado_at), asi que la rama del hogar no aplicaba y rompia la funcion
    -- entera con 'column "hogar_id" does not exist'. Las cuotas son por usuario.
    SELECT COALESCE(SUM(monto_cuota), 0) INTO total_compromisos_tarjeta
    FROM p_compromisos_tarjeta
    WHERE mes_periodo = date_trunc('month', p_mes_periodo)
      AND user_id = v_user_id;

    -- 4. El número final que el Frontend debe mostrar
    saldo_final_disponible := total_ingresos - total_asignado - total_compromisos_tarjeta;

    RETURN NEXT;
END; $function$;


-- 2) fn_reporte_proyeccion_presupuestaria
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
        WHERE mes_periodo = v_mes AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id))
          AND NOT EXISTS (
            SELECT 1 FROM public.p_estructuras_egresos ee
            JOIN public.p_presupuestos pp ON pp.estructura_egreso_id = ee.padre_id
            WHERE ee.estructura_id = p_presupuestos.estructura_egreso_id
              AND pp.mes_periodo = p_presupuestos.mes_periodo
              AND pp.user_id = p_presupuestos.user_id
              AND COALESCE(pp.monto_limite, 0) > 0
          )
        ;

        mes_proyectado := v_mes;
        ingresos_estimados := v_ingreso_promedio;
        compromisos_tarjeta := v_compromisos;
        presupuestos_asignados := v_presupuestos;
        disponible_proyectado := v_ingreso_promedio - v_compromisos - v_presupuestos;
        RETURN NEXT;
    END LOOP;
END;
$function$;


-- 3) fn_reporte_termometro_presupuestos
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
          AND NOT EXISTS (
            SELECT 1 FROM public.p_estructuras_egresos ee
            JOIN public.p_presupuestos pp ON pp.estructura_egreso_id = ee.padre_id
            WHERE ee.estructura_id = p.estructura_egreso_id
              AND pp.mes_periodo = p.mes_periodo
              AND pp.user_id = p.user_id
              AND COALESCE(pp.monto_limite, 0) > 0
          )
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


-- 4) fn_telemetry_refresh_user_metrics
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
    AND NOT EXISTS (
      SELECT 1 FROM public.p_estructuras_egresos ee
      JOIN public.p_presupuestos pp ON pp.estructura_egreso_id = ee.padre_id
      WHERE ee.estructura_id = p_presupuestos.estructura_egreso_id
        AND pp.mes_periodo = p_presupuestos.mes_periodo
        AND pp.user_id = p_presupuestos.user_id
        AND COALESCE(pp.monto_limite, 0) > 0
    )
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


-- 5) fn_obtener_saldo_a_asignar
CREATE OR REPLACE FUNCTION public.fn_obtener_saldo_a_asignar(p_mes_periodo date)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_f_inicio date;
    v_f_fin date;
    v_dia_ancla int2;
    v_moneda_local text;
    v_total_ingresos numeric := 0;
    v_total_asignado numeric := 0;
    v_total_tarjetas numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- Sin pais confirmado no hay moneda principal contra la cual comparar: 0 explicito.
    v_moneda_local := public.fn_get_default_currency(v_user_id);
    IF v_moneda_local IS NULL THEN
        RETURN 0;
    END IF;

    SELECT dia_ancla_ciclo INTO v_dia_ancla FROM p_presupuestos_config WHERE user_id = v_user_id;
    IF v_dia_ancla IS NULL THEN v_dia_ancla := 1; END IF;

    v_f_inicio := date_trunc('month', p_mes_periodo) + ((v_dia_ancla - 1) * INTERVAL '1 day');
    v_f_fin := (v_f_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- 1. Liquidez Total (solo billeteras normales activas de la MONEDA PRINCIPAL)
    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_total_ingresos
    FROM p_billeteras
    WHERE user_id = v_user_id AND activa = true AND es_fondo_prevision = false AND moneda = v_moneda_local;

    -- 2. Dinero ya comprometido en sobres: SOLO los saldos positivos.
    -- Ronda 7 (S1): antes se sumaba monto_disponible completo, y como un sobre en
    -- rojo es negativo, restarlo SUMABA liquidez inexistente (7.358.752 sobre
    -- 2.627.275 reales para el user 1). El sobregasto no se resta porque el gasto
    -- ya salio de la billetera: se muestra como alerta, no como plata disponible.
    SELECT COALESCE(SUM(GREATEST(monto_disponible, 0)), 0) INTO v_total_asignado
    FROM public.fn_reporte_sobres_detalle(p_mes_periodo)
    WHERE cuenta_en_totales;

    -- 3. Tarjetas impagas hasta el fin del ciclo actual
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_total_tarjetas
    FROM p_cuotas_detalle
    WHERE user_id = v_user_id AND pagado = false AND fecha_estimada_pago <= v_f_fin;

    RETURN v_total_ingresos - v_total_asignado - v_total_tarjetas;
END;
$function$;
;
