-- Corrige un aporte o un rescate YA registrado. Edita el movimiento original y
-- la MISMA pata de caja: nunca inserta uno nuevo, para no inventar un rescate
-- ficticio (DF-17, §8.2). Reglas ratificadas en L11: el aporte no puede quedar
-- por debajo de lo ya rescatado de su porcion, el rescate no puede superar lo
-- aportado, y cambiar de billetera o modalidad exige que la porcion vieja no
-- tenga movimientos del otro tipo. La fecha original se conserva y queda rastro
-- en p_sobre_movimientos_auditoria. El saldo de la billetera lo mantiene el
-- trigger tr_actualizar_saldo_p_caja_integral, que revierte el OLD y aplica el NEW.

CREATE OR REPLACE FUNCTION public.fn_sobre_editar_movimiento(p_movimiento_id bigint, p_importe numeric DEFAULT NULL::numeric, p_billetera_id bigint DEFAULT NULL::bigint, p_modalidad text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_mov public.p_sobre_movimientos;
    v_sobre public.p_sobres;
    v_importe numeric;
    v_billetera bigint;
    v_modalidad text;
    v_cruzado numeric;
    v_contrario text;
    v_antes jsonb;
    v_despues jsonb;
BEGIN
    SELECT u.user_id INTO v_user_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    SELECT * INTO v_mov FROM public.p_sobre_movimientos m
    WHERE m.movimiento_id = p_movimiento_id AND m.user_id = v_user_id;

    IF v_mov.movimiento_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_sobre_movement_not_found", "params": {}}';
    END IF;

    -- El rendimiento tiene su propia correccion, que tambien toca el ingreso.
    IF v_mov.tipo NOT IN ('aporte', 'rescate') THEN
        RAISE EXCEPTION '{"key": "error_sobre_not_a_contribution", "params": {}}';
    END IF;

    v_importe := COALESCE(p_importe, v_mov.importe);
    v_billetera := COALESCE(p_billetera_id, v_mov.billetera_id);
    v_modalidad := COALESCE(p_modalidad, v_mov.modalidad);

    IF v_importe IS NULL OR v_importe <= 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_amount_invalid", "params": {}}';
    END IF;
    IF v_modalidad NOT IN ('real', 'virtual') THEN
        RAISE EXCEPTION '{"key": "error_sobre_modality_invalid", "params": {}}';
    END IF;

    SELECT * INTO v_sobre FROM public.p_sobres b WHERE b.sobre_id = v_mov.sobre_id;

    IF NOT EXISTS (
        SELECT 1 FROM public.p_billeteras b
        WHERE b.billetera_id = v_billetera AND b.user_id = v_user_id
    ) THEN
        RAISE EXCEPTION '{"key": "error_sobre_wallet_not_found", "params": {}}';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.p_billeteras b
        WHERE b.billetera_id = v_billetera AND b.user_id = v_user_id AND b.moneda = v_sobre.moneda
    ) THEN
        RAISE EXCEPTION '{"key": "error_sobre_currency_mismatch", "params": {}}';
    END IF;

    v_contrario := CASE WHEN v_mov.tipo = 'aporte' THEN 'rescate' ELSE 'aporte' END;

    -- Mover el movimiento de porcion exige que la porcion vieja quede limpia.
    IF v_billetera <> v_mov.billetera_id OR v_modalidad <> v_mov.modalidad THEN
        IF EXISTS (
            SELECT 1 FROM public.p_sobre_movimientos m
            WHERE m.sobre_id = v_mov.sobre_id
              AND m.billetera_id = v_mov.billetera_id
              AND m.modalidad = v_mov.modalidad
              AND m.tipo = v_contrario
        ) THEN
            RAISE EXCEPTION '{"key": "error_sobre_portion_in_use", "params": {}}';
        END IF;
    END IF;

    -- Lo que el otro tipo ya movio en la porcion destino, sin contar este movimiento.
    SELECT COALESCE(SUM(m.importe), 0) INTO v_cruzado
    FROM public.p_sobre_movimientos m
    WHERE m.sobre_id = v_mov.sobre_id
      AND m.billetera_id = v_billetera
      AND m.modalidad = v_modalidad
      AND m.tipo = v_contrario
      AND m.movimiento_id <> v_mov.movimiento_id;

    -- El importe viaja con % y no dentro de la cadena: RAISE EXCEPTION no
    -- interpola variables adentro de un literal.
    IF v_mov.tipo = 'aporte' AND v_importe < v_cruzado THEN
        RAISE EXCEPTION '{"key": "error_sobre_aporte_below_rescued", "params": {"minimo": %}}', v_cruzado;
    END IF;
    IF v_mov.tipo = 'rescate' AND v_importe > v_cruzado THEN
        RAISE EXCEPTION '{"key": "error_sobre_rescate_above_contributed", "params": {"maximo": %}}', v_cruzado;
    END IF;

    v_antes := jsonb_build_object(
        'importe', v_mov.importe,
        'billetera_id', v_mov.billetera_id,
        'modalidad', v_mov.modalidad
    );

    UPDATE public.p_sobre_movimientos
    SET importe = v_importe,
        billetera_id = v_billetera,
        modalidad = v_modalidad,
        actualizado_at = now()
    WHERE movimiento_id = v_mov.movimiento_id;

    -- La MISMA pata de caja: se corrige, no se agrega otra.
    IF v_mov.caja_movimiento_id IS NOT NULL THEN
        UPDATE public.p_caja
        SET billetera_origen_id = v_billetera,
            valor_egreso = CASE WHEN v_mov.tipo = 'aporte' THEN v_importe ELSE 0 END,
            valor_ingreso = CASE WHEN v_mov.tipo = 'rescate' THEN v_importe ELSE 0 END
        WHERE p_caja_id = v_mov.caja_movimiento_id AND user_id = v_user_id;
    END IF;

    v_despues := jsonb_build_object(
        'importe', v_importe,
        'billetera_id', v_billetera,
        'modalidad', v_modalidad
    );

    INSERT INTO public.p_sobre_movimientos_auditoria (
        movimiento_id, user_id, datos_anteriores, datos_nuevos, motivo
    ) VALUES (
        v_mov.movimiento_id, v_user_id, v_antes, v_despues, 'savings_movement_edit'
    );

    UPDATE public.p_sobres SET actualizado_at = now() WHERE sobre_id = v_mov.sobre_id;
END;
$function$;
