CREATE OR REPLACE FUNCTION public.fn_sobre_pata_billetera(p_user_id bigint, p_billetera_id bigint, p_moneda text, p_importe numeric, p_salida boolean, p_detalle text, p_sobre_id bigint, p_sobre_nombre text, p_fecha date DEFAULT CURRENT_DATE)
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
        COALESCE(p_fecha, CURRENT_DATE),
        p_moneda,
        p_detalle,
        jsonb_build_object('sobre_id', p_sobre_id, 'sobre_nombre', p_sobre_nombre, 'savings', true)
    )
    RETURNING p_caja_id INTO v_caja_id;

    RETURN v_caja_id;
END;
$function$;
