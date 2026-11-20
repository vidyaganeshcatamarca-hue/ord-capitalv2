CREATE OR REPLACE FUNCTION public.fn_saneamiento_simular(p_prestamo_id bigint, p_monto numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_p       public.p_prestamos%ROWTYPE;
    v_pagado  numeric;
    v_saldo   numeric;
    v_nuevo   numeric;
    v_n_pend  integer;
    v_n_cubiertas integer;
    v_int_ok  boolean;
    v_int_sum numeric;
    v_result  jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT hogar_id INTO v_hogar_id FROM public.p_hogar_participantes WHERE user_id = v_user_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'error_unauthorized';
    END IF;
    IF p_monto IS NULL OR p_monto <= 0 THEN
        RAISE EXCEPTION 'error_invalid_amount';
    END IF;

    SELECT * INTO v_p FROM public.p_prestamos
    WHERE prestamo_id = p_prestamo_id
      AND (user_id = v_user_id OR (v_hogar_id IS NOT NULL AND hogar_id = v_hogar_id));
    IF NOT FOUND THEN
        RAISE EXCEPTION 'error_debt_not_found';
    END IF;

    v_saldo := COALESCE(v_p.saldo_actual, 0);
    v_nuevo := GREATEST(0, v_saldo - p_monto);

    SELECT COALESCE(SUM(monto_aplicado), 0) INTO v_pagado
    FROM public.p_prestamos_pagos
    WHERE prestamo_id = p_prestamo_id AND estado = 'activo';

    v_result := jsonb_build_object(
        'saldo_pendiente',  v_saldo,
        'monto_propuesto',  p_monto,
        'saldo_proyectado', v_nuevo,
        'moneda',           trim(v_p.moneda_iso)
    );

    -- Months are only meaningful against a real schedule.
    IF v_p.modalidad <> 'cuotas' THEN
        RETURN v_result || jsonb_build_object(
            'meses_restantes', NULL,
            'meses_ahorrados', NULL,
            'intereses_ahorrados', NULL,
            'motivo', 'sin_cronograma');
    END IF;

    WITH prog AS (
        SELECT c.cuota_id, c.monto_cuota, c.interes_componente,
               SUM(c.monto_cuota) OVER (ORDER BY c.fecha_vencimiento, c.numero_cuota
                                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado
        FROM public.p_prestamos_cuotas c
        WHERE c.prestamo_id = p_prestamo_id
    )
    SELECT count(*) FILTER (WHERE acumulado > v_pagado),
           count(*) FILTER (WHERE acumulado > v_pagado AND acumulado <= v_pagado + p_monto),
           bool_and(interes_componente IS NOT NULL) FILTER (WHERE acumulado > v_pagado AND acumulado <= v_pagado + p_monto),
           SUM(interes_componente) FILTER (WHERE acumulado > v_pagado AND acumulado <= v_pagado + p_monto)
      INTO v_n_pend, v_n_cubiertas, v_int_ok, v_int_sum
    FROM prog;

    v_result := v_result || jsonb_build_object(
        'meses_restantes', v_n_pend,
        'meses_ahorrados', v_n_cubiertas,
        'intereses_ahorrados',
            CASE WHEN v_n_cubiertas = 0 THEN 0
                 WHEN COALESCE(v_int_ok, false) THEN v_int_sum
                 ELSE NULL END,
        'motivo',
            CASE WHEN v_n_cubiertas = 0 THEN 'el_pago_no_cancela_cuotas_completas'
                 WHEN COALESCE(v_int_ok, false) THEN NULL
                 ELSE 'interes_por_cuota_no_informado' END);

    RETURN v_result;
END;
$function$
