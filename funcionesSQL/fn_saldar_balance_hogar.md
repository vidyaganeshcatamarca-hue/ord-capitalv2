CREATE OR REPLACE FUNCTION public.fn_saldar_balance_hogar(
    p_tipo text,
    p_monto numeric,
    p_direccion text DEFAULT 'invitado_a_creador'::text,
    p_billetera_origen_id bigint DEFAULT NULL::bigint,
    p_billetera_destino_id bigint DEFAULT NULL::bigint,
    p_nota text DEFAULT NULL::text
)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
    v_user_creador int8;
    v_user_invitado int8;
    v_de_user_id int8;
    v_para_user_id int8;
    v_deuda_actual numeric := 0;
    v_balance_gastos numeric := 0;
    v_pagos_creador_a_invitado numeric := 0;
    v_pagos_invitado_a_creador numeric := 0;
    v_ultimo_corte timestamp with time zone;
    v_result_id int8;
    v_caja_id int8;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    IF p_tipo NOT IN ('transferencia_real', 'marcar_saldado') THEN
        RAISE EXCEPTION '{"key": "error_invalid_reconciliation_type", "params": {}}';
    END IF;

    IF p_monto <= 0 THEN
        RAISE EXCEPTION '{"key": "error_amount_must_be_positive", "params": {}}';
    END IF;

    IF p_direccion NOT IN ('creador_a_invitado', 'invitado_a_creador') THEN
        RAISE EXCEPTION '{"key": "error_invalid_direction", "params": {}}';
    END IF;

    SELECT hp.hogar_id INTO v_hogar_id FROM p_hogar_participantes hp WHERE hp.user_id = v_user_id LIMIT 1;
    IF v_hogar_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_home_not_found", "params": {}}';
    END IF;

    SELECT user_id INTO v_user_creador FROM p_hogar_participantes WHERE hogar_id = v_hogar_id AND rol = 'creador';
    SELECT user_id INTO v_user_invitado FROM p_hogar_participantes WHERE hogar_id = v_hogar_id AND rol = 'invitado';

    IF p_direccion = 'creador_a_invitado' THEN
        v_de_user_id := v_user_creador;
        v_para_user_id := v_user_invitado;
    ELSE
        v_de_user_id := v_user_invitado;
        v_para_user_id := v_user_creador;
    END IF;

    -- Calcular deuda actual (mismo cálculo que fn_reporte_hogar_balances)
    SELECT COALESCE(MAX(creado_at), '1900-01-01'::timestamp)
    INTO v_ultimo_corte
    FROM p_hogar_conciliaciones
    WHERE hogar_id = v_hogar_id;

    SELECT COALESCE(SUM(
        CASE
            WHEN pagado_por_user_id = v_user_creador THEN ROUND(valor_egreso * (COALESCE(porcentaje_invitado_snapshot, 50.00) / 100), 2)
            WHEN pagado_por_user_id = v_user_invitado THEN -ROUND(valor_egreso * (COALESCE(porcentaje_creador_snapshot, 50.00) / 100), 2)
            ELSE 0
        END
    ), 0) INTO v_balance_gastos
    FROM p_caja
    WHERE hogar_id = v_hogar_id
      AND es_compartido = true
      AND creado_at >= v_ultimo_corte;

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

    v_deuda_actual := v_balance_gastos + v_pagos_creador_a_invitado - v_pagos_invitado_a_creador;

    IF p_tipo = 'transferencia_real' THEN
        IF p_billetera_origen_id IS NULL OR p_billetera_destino_id IS NULL THEN
            RAISE EXCEPTION '{"key": "error_real_transfer_needs_wallets", "params": {}}';
        END IF;
    END IF;

    IF v_deuda_actual = 0 THEN
        RAISE EXCEPTION '{"key": "error_home_no_debt_to_settle", "params": {}}';
    END IF;

    IF p_monto >= ABS(v_deuda_actual) THEN
        -- SALDAR COMPLETO: insertar hito de reset en p_hogar_conciliaciones
        INSERT INTO p_hogar_conciliaciones (
            hogar_id, creado_por_user_id, tipo, monto_saldado,
            direccion, billetera_origen_id, billetera_destino_id, nota
        ) VALUES (
            v_hogar_id, v_user_id, p_tipo, ABS(v_deuda_actual),
            p_direccion, p_billetera_origen_id, p_billetera_destino_id, p_nota
        ) RETURNING conciliacion_id INTO v_result_id;
    ELSE
        -- ABONO PARCIAL: insertar en p_hogar_pagos (no resetea histórico)
        INSERT INTO p_hogar_pagos (hogar_id, de_user_id, para_user_id, monto)
        VALUES (v_hogar_id, v_de_user_id, v_para_user_id, p_monto)
        RETURNING pago_id INTO v_result_id;
    END IF;

    IF p_tipo = 'transferencia_real' THEN
        INSERT INTO p_caja (
            user_id, tipo, billetera_origen_id, billetera_destino_id,
            valor_egreso, fecha, detalle
        ) VALUES (
            v_user_id, 'transfer', p_billetera_origen_id, p_billetera_destino_id,
            p_monto, CURRENT_DATE, COALESCE(p_nota, 'home_balance_settlement')
        ) RETURNING p_caja_id INTO v_caja_id;
    END IF;

    RETURN v_result_id;
END;
$function$;