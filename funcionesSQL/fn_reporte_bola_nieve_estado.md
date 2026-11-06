CREATE OR REPLACE FUNCTION public.fn_reporte_bola_nieve_estado()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_deuda_total numeric := 0;
    v_pagado_total numeric := 0;
    v_fecha_inicio date;
    v_estrategia_actual text;
    v_cuota_total numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT COALESCE(SUM(saldo_actual), 0), COALESCE(SUM(monto_original - saldo_actual), 0)
    INTO v_deuda_total, v_pagado_total
    FROM public.p_prestamos
    WHERE user_id = v_user_id AND estado = 'activo';

    SELECT COALESCE(SUM(cuota_mensual), 0)
    INTO v_cuota_total
    FROM public.p_prestamos
    WHERE user_id = v_user_id AND estado = 'activo';

    SELECT fecha_inicio_plan, estrategia_activa
    INTO v_fecha_inicio, v_estrategia_actual
    FROM public.p_config_bola_nieve
    WHERE user_id = v_user_id
    LIMIT 1;

    IF v_fecha_inicio IS NULL THEN
        v_fecha_inicio := CURRENT_DATE;
        v_estrategia_actual := 'math';

        INSERT INTO public.p_config_bola_nieve (user_id, estrategia_activa, fecha_inicio_plan)
        VALUES (v_user_id, v_estrategia_actual, v_fecha_inicio)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'deuda_total', ROUND(v_deuda_total, 2),
        'pagado_total', ROUND(v_pagado_total, 2),
        'porcentaje_completado', CASE WHEN (v_deuda_total + v_pagado_total) > 0
            THEN ROUND((v_pagado_total / (v_deuda_total + v_pagado_total)) * 100, 2)
            ELSE 0 END,
        'fecha_inicio', v_fecha_inicio,
        'fecha_fin_estimada', CASE WHEN v_cuota_total > 0
            THEN CURRENT_DATE + ((GREATEST(0, v_deuda_total) / v_cuota_total) || ' months')::interval
            ELSE CURRENT_DATE + INTERVAL '6 months' END,
        'dias_en_plan', CURRENT_DATE - v_fecha_inicio,
        'estrategia_activa', v_estrategia_actual
    );
END;
$function$
