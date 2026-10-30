-- 146: dos RPC que estaban rotas en produccion, ajenas a la ronda de auditoria.
--
-- (1) fn_obtener_saldo_disponible_para_asignar(date) fallaba con
--     'column "hogar_id" does not exist': filtraba por hogar_id una tabla que no
--     tiene esa columna. El frontend no la llama, pero quedaba como trampa.
-- (2) fn_reporte_evolucion_presupuesto() fallaba siempre con
--     'BY value of FOR loop must be greater than zero' porque usaba BY -1.
--
-- No se toca fn_reporte_escudo_tiempo(uuid): es una implementacion vieja con otra
-- firma, no una version rota de la actual. Queda para decision del dueno.

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
    
    -- PL/pgSQL rechaza BY negativo ('BY value of FOR loop must be greater than
    -- zero') y la funcion fallaba siempre. Ojo con REVERSE: los limites van de
    -- mayor a menor. Medido con bucles minimos: 'REVERSE 5..0' recorre 5,4,3,2,1,0;
    -- 'REVERSE 0..5' no ejecuta ni una vuelta (y no da error, asi que devuelve la
    -- lista vacia sin avisar).
    FOR v_i IN REVERSE 5..0 LOOP
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
