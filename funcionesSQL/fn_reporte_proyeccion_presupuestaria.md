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
    FROM p_caja WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days';
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
$function$
