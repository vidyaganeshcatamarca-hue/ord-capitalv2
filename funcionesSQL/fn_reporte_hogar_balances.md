CREATE OR REPLACE FUNCTION public.fn_reporte_hogar_balances()
 RETURNS TABLE(user_id_deudor bigint, nombre_deudor text, user_id_acreedor bigint, nombre_acreedor text, monto_deuda numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id int8;
    v_user_creador int8;
    v_user_invitado int8;
    v_balance_gastos numeric := 0;
    v_pagos_creador_a_invitado numeric := 0;
    v_pagos_invitado_a_creador numeric := 0;
    v_balance_neto numeric := 0;
    v_ultimo_corte timestamp with time zone;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT hp.hogar_id INTO v_hogar_id
    FROM p_hogar_participantes hp
    WHERE hp.user_id = v_user_id
    LIMIT 1;
    IF v_hogar_id IS NULL THEN RETURN; END IF;

    SELECT user_id INTO v_user_creador FROM p_hogar_participantes WHERE hogar_id = v_hogar_id AND rol = 'creador';
    SELECT user_id INTO v_user_invitado FROM p_hogar_participantes WHERE hogar_id = v_hogar_id AND rol = 'invitado';

    -- Fecha del último corte de conciliación (respeta el saldar on-demand)
    SELECT COALESCE(MAX(creado_at), '1900-01-01'::timestamp)
    INTO v_ultimo_corte
    FROM p_hogar_conciliaciones
    WHERE hogar_id = v_hogar_id;

    -- Gastos compartidos posteriores al último corte (strictly AFTER corte timestamp)
    SELECT COALESCE(
        SUM(
            CASE 
                WHEN pagado_por_user_id = v_user_creador THEN ROUND(valor_egreso * (COALESCE(porcentaje_invitado_snapshot, 50.00) / 100), 2)
                WHEN pagado_por_user_id = v_user_invitado THEN -ROUND(valor_egreso * (COALESCE(porcentaje_creador_snapshot, 50.00) / 100), 2)
                ELSE 0 
            END
        ), 0
    ) INTO v_balance_gastos
    FROM p_caja 
    WHERE hogar_id = v_hogar_id 
      AND es_compartido = true
      AND creado_at >= v_ultimo_corte;

    -- Pagos internos posteriores al último corte (abonos parciales sin reset)
    SELECT COALESCE(SUM(monto), 0) INTO v_pagos_creador_a_invitado 
    FROM p_hogar_pagos 
    WHERE hogar_id = v_hogar_id 
      AND de_user_id = v_user_creador 
      AND para_user_id = v_user_invitado
      AND creado_at >= v_ultimo_corte;

    SELECT COALESCE(SUM(monto), 0) INTO v_pagos_invitado_a_creador 
    FROM p_hogar_pagos 
    WHERE hogar_id = v_hogar_id 
      AND de_user_id = v_user_invitado 
      AND para_user_id = v_user_creador
      AND creado_at >= v_ultimo_corte;

    v_balance_neto := v_balance_gastos + v_pagos_creador_a_invitado - v_pagos_invitado_a_creador;

    IF v_balance_neto > 0 THEN
        RETURN QUERY SELECT v_user_invitado, (SELECT nombre FROM usuarios WHERE user_id = v_user_invitado), v_user_creador, (SELECT nombre FROM usuarios WHERE user_id = v_user_creador), ROUND(ABS(v_balance_neto), 2);
    ELSIF v_balance_neto < 0 THEN
        RETURN QUERY SELECT v_user_creador, (SELECT nombre FROM usuarios WHERE user_id = v_user_creador), v_user_invitado, (SELECT nombre FROM usuarios WHERE user_id = v_user_invitado), ROUND(ABS(v_balance_neto), 2);
    END IF;
END;
$function$;