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
END; $function$
