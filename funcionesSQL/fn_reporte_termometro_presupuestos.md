-- fn_reporte_termometro_presupuestos v3 — owner directive 2026:
-- "el gráfico es una foto del ingreso real y de los gastos reales de ese
-- ciclo en relación a los porcentajes definidos" — no 90-day average, no
-- assigned-budget basis.
--   Numerator per cupo: real cycle value (gastos for need/want/tithe with
--   parent-inherited tipo_cupo; dinero transferido a sobres de ahorro =
--   p_presupuestas assignment for saving/investment cupos, prior owner decision).
--   Denominator: configured % × REAL cycle income (same scope as the
--   consumption queries: user + hogares compartidos).
--   NEW estado column (sobre vocabulary): sin_datos when cycle income = 0.
--   need/want/tithe: verde <=70% of ideal, amarillo <=100%, rojo >100%.
--   ahorro (owner directive 2026-10-08, reverse direction): semaforo measures
--   saving discipline - rojo <50% of ideal, amarillo <90%, verde >=90%
--   (over-saving is also verde; the bar still shows the real >100% length).

DROP FUNCTION IF EXISTS public.fn_reporte_termometro_presupuestos(date);

CREATE OR REPLACE FUNCTION public.fn_reporte_termometro_presupuestos(
  p_mes_periodo date DEFAULT date_trunc('month', (CURRENT_DATE)::timestamp with time zone)
)
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
        SELECT SUM(c.valor_ingreso) FROM public.p_caja c
        WHERE c.tipo = 'income' AND c.fecha BETWEEN v_f_inicio AND v_f_fin
          AND ((c.user_id = v_user_id AND c.es_compartido = false)
            OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0);

    -- Límite ideal del cupo = porcentaje definido × ingreso real del ciclo
    v_lim_nec    := ROUND((v_ingreso_ciclo * (v_pct_nec / 100)), 2);
    v_lim_des    := ROUND((v_ingreso_ciclo * (v_pct_des / 100)), 2);
    v_lim_diezmo := ROUND((v_ingreso_ciclo * (v_pct_diezmo / 100)), 2);
    v_lim_ahorro := ROUND((v_ingreso_ciclo * (v_pct_ahorro / 100)), 2);

    -- Consumo real por cupo, tipo_cupo heredado del padre
    v_cons_nec := COALESCE((SELECT SUM(c.valor_egreso) FROM public.p_caja c
        JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        LEFT JOIN public.p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
        WHERE c.tipo = 'expense' AND COALESCE(padre.tipo_cupo, e.tipo_cupo) = 'need'
          AND c.fecha BETWEEN v_f_inicio AND v_f_fin
          AND ((c.user_id = v_user_id AND c.es_compartido = false)
            OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0);

    v_cons_des := COALESCE((SELECT SUM(c.valor_egreso) FROM public.p_caja c
        JOIN public.p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        LEFT JOIN public.p_estructuras_egresos padre ON e.padre_id = padre.estructura_id
        WHERE c.tipo = 'expense' AND COALESCE(padre.tipo_cupo, e.tipo_cupo) = 'want'
          AND c.fecha BETWEEN v_f_inicio AND v_f_fin
          AND ((c.user_id = v_user_id AND c.es_compartido = false)
            OR (v_hogar_id IS NOT NULL AND c.hogar_id = v_hogar_id AND c.es_compartido = true))), 0);

    v_cons_diezmo := COALESCE((SELECT SUM(c.valor_egreso) FROM public.p_caja c
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