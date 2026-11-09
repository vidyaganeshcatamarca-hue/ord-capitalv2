-- Helper interno. Escribe la pata de billetera en p_caja de un movimiento de
-- ahorro: tipo adjustment, porque es el unico que mueve el saldo sin contarse
-- como gasto ni ingreso. Se usa para el aporte real, el rescate real y el
-- rendimiento. No expuesto al cliente (EXECUTE revocado).
-- p_caja no es opcional: p_billeteras.saldo_actual es una suma cacheada de
-- p_caja y fn_recalcular_saldos_billeteras la reconstruye desde ahi.

CREATE OR REPLACE FUNCTION public.fn_sobre_pata_billetera(p_user_id bigint, p_billetera_id bigint, p_moneda text, p_importe numeric, p_salida boolean, p_detalle text, p_sobre_id bigint, p_sobre_nombre text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caja_id bigint;
BEGIN
    IF p_importe IS NULL OR p_importe <= 0 THEN
        RAISE EXCEPTION '{"key": "error_sobre_amount_invalid", "params": {}}';
    END IF;

    -- Bloqueo de la billetera antes de mover: dos aportes concurrentes no pueden
    -- gastar el mismo saldo.
    PERFORM 1 FROM public.p_billeteras
    WHERE billetera_id = p_billetera_id AND user_id = p_user_id
    FOR UPDATE;

    INSERT INTO public.p_caja (
        user_id, tipo, billetera_origen_id, valor_ingreso, valor_egreso,
        fecha, moneda, detalle, metadata
    ) VALUES (
        p_user_id,
        'adjustment',
        p_billetera_id,
        CASE WHEN p_salida THEN 0 ELSE p_importe END,
        CASE WHEN p_salida THEN p_importe ELSE 0 END,
        CURRENT_DATE,
        p_moneda,
        p_detalle,
        jsonb_build_object('sobre_id', p_sobre_id, 'sobre_nombre', p_sobre_nombre, 'savings', true)
    )
    RETURNING p_caja_id INTO v_caja_id;

    RETURN v_caja_id;
END;
$function$;
