-- Corrige un rendimiento YA registrado. Edita el movimiento original y la MISMA
-- fila de ingreso: nunca inserta un segundo ingreso. La fecha original se
-- conserva y queda rastro en p_sobre_movimientos_auditoria.
-- PRD: DF-28, §7.3.

CREATE OR REPLACE FUNCTION public.fn_sobre_rendimiento_editar(p_movimiento_id bigint, p_importe numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_mov public.p_sobre_movimientos;
    v_antes jsonb;
    v_despues jsonb;
    v_ingreso public.p_caja;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT * INTO v_mov FROM public.p_sobre_movimientos m
    WHERE m.movimiento_id = p_movimiento_id AND m.user_id = v_user_id;

    IF v_mov.movimiento_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_movement_not_found", "params": {}}';
    END IF;
    IF v_mov.tipo <> 'rendimiento' THEN
        RAISE EXCEPTION '{"key": "error_sobre_not_a_yield", "params": {}}';
    END IF;
    IF p_importe IS NULL OR p_importe <= 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_amount_invalid", "params": {}}';
    END IF;

    v_antes := jsonb_build_object('importe', v_mov.importe, 'fecha', v_mov.fecha);

    UPDATE public.p_sobre_movimientos
    SET importe = p_importe, actualizado_at = now()
    WHERE movimiento_id = p_movimiento_id;

    -- La misma fila de ingreso: nunca se inserta una segunda.
    IF v_mov.caja_ingreso_id IS NOT NULL THEN
        UPDATE public.p_caja
        SET valor_ingreso = p_importe
        WHERE p_caja_id = v_mov.caja_ingreso_id AND user_id = v_user_id;
    END IF;

    IF v_mov.caja_movimiento_id IS NOT NULL THEN
        UPDATE public.p_caja
        SET valor_egreso = p_importe
        WHERE p_caja_id = v_mov.caja_movimiento_id AND user_id = v_user_id;
    END IF;

    v_despues := jsonb_build_object('importe', p_importe, 'fecha', v_mov.fecha);

    INSERT INTO public.p_sobre_movimientos_auditoria (
        movimiento_id, user_id, datos_anteriores, datos_nuevos, motivo
    ) VALUES (
        p_movimiento_id, v_user_id, v_antes, v_despues, 'savings_yield_edit'
    );

    UPDATE public.p_sobres SET actualizado_at = now() WHERE sobre_id = v_mov.sobre_id;
END;
$function$;
