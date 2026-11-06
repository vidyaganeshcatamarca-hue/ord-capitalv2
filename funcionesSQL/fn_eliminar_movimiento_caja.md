CREATE OR REPLACE FUNCTION public.fn_eliminar_movimiento_caja(p_caja_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint;
    v_tipo text;
    v_valor_ingreso numeric;
    v_valor_egreso numeric;
    v_billetera_origen_id bigint;
    v_billetera_destino_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- Obtener datos del movimiento
    SELECT tipo, valor_ingreso, valor_egreso, billetera_origen_id, billetera_destino_id 
    INTO v_tipo, v_valor_ingreso, v_valor_egreso, v_billetera_origen_id, v_billetera_destino_id
    FROM p_caja 
    WHERE p_caja.p_caja_id = fn_eliminar_movimiento_caja.p_caja_id 
      AND (user_id = v_user_id OR (es_compartido = true AND hogar_id = (SELECT hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id LIMIT 1)));
      
    IF NOT FOUND THEN RAISE EXCEPTION '{"key": "error_movement_not_found", "params": {}}'; END IF;

    -- Revertir el saldo antes de eliminar
    IF (v_tipo IN ('income', 'opening')) OR (v_tipo = 'adjustment' AND v_valor_ingreso > 0) THEN
        UPDATE p_billeteras SET saldo_actual = saldo_actual - v_valor_ingreso WHERE billetera_id = v_billetera_origen_id;
    ELSIF (v_tipo = 'expense') OR (v_tipo = 'adjustment' AND v_valor_egreso > 0) THEN
        UPDATE p_billeteras SET saldo_actual = saldo_actual + v_valor_egreso WHERE billetera_id = v_billetera_origen_id;
    ELSIF (v_tipo = 'transfer') THEN
        UPDATE p_billeteras SET saldo_actual = saldo_actual + v_valor_egreso WHERE billetera_id = v_billetera_origen_id;
        UPDATE p_billeteras SET saldo_actual = saldo_actual - v_valor_egreso WHERE billetera_id = v_billetera_destino_id;
    END IF;

    -- Eliminar registro
    DELETE FROM p_caja 
    WHERE p_caja.p_caja_id = fn_eliminar_movimiento_caja.p_caja_id;
END;
$function$