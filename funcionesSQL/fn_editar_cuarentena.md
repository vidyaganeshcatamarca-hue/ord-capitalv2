CREATE OR REPLACE FUNCTION public.fn_editar_cuarentena(p_pendiente_id bigint, p_nueva_estructura_id bigint, p_nuevo_monto numeric, p_nuevo_detalle text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id
    FROM public.usuarios
    WHERE auth_id = auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    UPDATE public.p_caja_cuarentena
    SET
        estructura_egreso_id = p_nueva_estructura_id,
        monto = p_nuevo_monto,
        detalle = p_nuevo_detalle
    WHERE pendiente_id = p_pendiente_id
      AND user_id = v_user_id
      AND estado = 'pendiente';

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_quarantine_not_found", "params": {}}';
    END IF;
END;
$function$
