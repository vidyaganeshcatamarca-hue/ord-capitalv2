CREATE OR REPLACE FUNCTION public.fn_archivar_tarjeta_credito(p_tarjeta_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint;
    v_cuotas_pendientes numeric := 0;
    v_compromisos_pendientes numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    -- 1. Verificar si hay cuotas de compras pendientes (pagado = false)
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_cuotas_pendientes
    FROM p_cuotas_detalle
    WHERE tarjeta_id = p_tarjeta_id AND pagado = false AND user_id = v_user_id;

    -- 2. Verificar si hay compromisos fijos pendientes (pagado = false)
    SELECT COALESCE(SUM(monto_cuota), 0) INTO v_compromisos_pendientes
    FROM p_compromisos_tarjeta
    WHERE tarjeta_id = p_tarjeta_id AND pagado = false AND user_id = v_user_id;

    IF v_cuotas_pendientes > 0 OR v_compromisos_pendientes > 0 THEN
        RAISE EXCEPTION '{"key": "error_card_has_commitments", "params": {}}';
    END IF;

    UPDATE p_tarjetas_credito SET activa = false
    WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_card_not_found", "params": {}}';
    END IF;
END;
$function$