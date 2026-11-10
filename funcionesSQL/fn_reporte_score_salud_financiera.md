CREATE OR REPLACE FUNCTION public.fn_reporte_score_salud_financiera()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_escudo_dias int;
    v_score_proteccion int := 0;
    v_score_presupuesto int := 75;
    v_score_deuda int := 100;
    v_score_crecimiento int := 50;
    v_score_ahorro int := 0;
    v_score_global numeric := 0;
    v_meta_ahorro numeric;
    v_actual_ahorro numeric;
    v_deuda_total numeric;
    v_config_inflacion RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(dias_supervivencia_deuda_total, 0) INTO v_escudo_dias FROM public.fn_reporte_escudo_tiempo() LIMIT 1;
    
    v_score_proteccion := CASE 
        WHEN v_escudo_dias >= 180 THEN 100
        WHEN v_escudo_dias >= 90 THEN 75
        WHEN v_escudo_dias >= 30 THEN 50
        ELSE 25
    END;

    SELECT COALESCE(SUM(saldo_actual), 0) INTO v_deuda_total FROM p_prestamos WHERE user_id = v_user_id AND estado = 'activo';
    
    IF v_deuda_total = 0 THEN
        v_score_deuda := 100;
    ELSE
        v_score_deuda := GREATEST(0, 100 - (v_deuda_total / 10000)); 
    END IF;

        -- El ahorro se mide con los sobres que tienen meta: la meta declarada contra
    -- el saldo vivo del sobre. El ratio no depende de la moneda, asi que no hay
    -- que convertir nada. Los archivados no cuentan (se archivan en cero).
    SELECT COALESCE(SUM(s.monto_meta), 0), COALESCE(SUM(public.fn_sobre_saldo(s.sobre_id)), 0)
    INTO v_meta_ahorro, v_actual_ahorro
    FROM public.p_sobres s
    WHERE s.user_id = v_user_id
      AND s.archivado_at IS NULL
      AND s.monto_meta IS NOT NULL;

    IF v_meta_ahorro > 0 THEN
        v_score_ahorro := LEAST(100, ROUND((v_actual_ahorro / v_meta_ahorro) * 100));
    ELSE
        v_score_ahorro := 0;
    END IF;

    v_score_global := (v_score_proteccion * 0.15) + (v_score_presupuesto * 0.25) + (v_score_deuda * 0.25) + (v_score_crecimiento * 0.15) + (v_score_ahorro * 0.20);

    RETURN jsonb_build_object(
        'score_global', ROUND(v_score_global),
        'dimensiones', jsonb_build_object(
            'proteccion', v_score_proteccion,
            'presupuesto', v_score_presupuesto,
            'deuda', v_score_deuda,
            'crecimiento', v_score_crecimiento,
            'ahorro', v_score_ahorro
        ),
        'estado', CASE 
            WHEN v_score_global >= 80 THEN 'health_excellent'
            WHEN v_score_global >= 60 THEN 'health_healthy'
            WHEN v_score_global >= 40 THEN 'health_risk'
            ELSE 'health_critical'
        END,
        'datos_detalle', jsonb_build_object(
            'escudo_dias', v_escudo_dias,
            'deuda_total', v_deuda_total,
            'ahorro_meta', v_meta_ahorro,
            'ahorro_actual', v_actual_ahorro
        )
    );
END;
$function$;
