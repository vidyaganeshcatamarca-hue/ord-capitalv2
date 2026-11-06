CREATE OR REPLACE FUNCTION public.fn_marcar_cuotas_pagadas(p_tarjeta_id bigint, p_monto_pagado numeric, p_caja_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_user_id bigint; v_monto_restante numeric; r_cuota RECORD;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    v_monto_restante := p_monto_pagado;

    FOR r_cuota IN SELECT cuota_id, monto_cuota FROM p_cuotas_detalle WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id AND pagado = false ORDER BY fecha_estimada_pago ASC LOOP
        IF v_monto_restante >= r_cuota.monto_cuota THEN
            UPDATE p_cuotas_detalle SET pagado = true, p_caja_id = p_caja_id WHERE cuota_id = r_cuota.cuota_id;
            v_monto_restante := v_monto_restante - r_cuota.monto_cuota;
        ELSE
            UPDATE p_cuotas_detalle SET monto_cuota = monto_cuota - v_monto_restante WHERE cuota_id = r_cuota.cuota_id;
            v_monto_restante := 0; EXIT;
        END IF;
        IF v_monto_restante <= 0 THEN EXIT; END IF;
    END LOOP;
END;
$function$