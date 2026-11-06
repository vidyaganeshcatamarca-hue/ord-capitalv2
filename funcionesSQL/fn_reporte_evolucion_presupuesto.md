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
        FROM p_caja
        WHERE user_id = v_user_id AND tipo = 'income'
          AND fecha >= v_f_inicio AND fecha <= v_f_fin;
        
        IF v_ingreso_mes = 0 THEN
            CONTINUE;
        END IF;
        
        SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_cons_nec
        FROM p_caja c
        INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'need'
          AND c.fecha >= v_f_inicio AND c.fecha <= v_f_fin;
        
        SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_cons_des
        FROM p_caja c
        INNER JOIN p_estructuras_egresos e ON c.estructura_egreso_id = e.estructura_id
        WHERE c.user_id = v_user_id AND c.tipo = 'expense' AND e.tipo_cupo = 'want'
          AND c.fecha >= v_f_inicio AND c.fecha <= v_f_fin;
        
        SELECT COALESCE(SUM(c.valor_egreso), 0) INTO v_cons_diezmo
        FROM p_caja c
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

