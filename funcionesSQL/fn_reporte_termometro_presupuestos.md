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
$function$
