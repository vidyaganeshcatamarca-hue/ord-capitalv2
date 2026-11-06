CREATE OR REPLACE FUNCTION public.fn_editar_gasto_cuarentena(p_pendiente_id bigint, p_monto numeric DEFAULT NULL::numeric, p_estructura_egreso_id bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_billetera_id bigint DEFAULT NULL::bigint, p_detalle text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE p_caja_cuarentena SET 
        monto = COALESCE(p_monto, monto),
        estructura_egreso_id = COALESCE(p_estructura_egreso_id, estructura_egreso_id),
        fecha = COALESCE(p_fecha, fecha),
        billetera_id = COALESCE(p_billetera_id, billetera_id),
        detalle = COALESCE(p_detalle, detalle)
    WHERE pendiente_id = p_pendiente_id AND user_id = v_user_id AND estado = 'pendiente';

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_quarantine_item_not_found", "params": {}}';
    END IF;
END;
$function$
