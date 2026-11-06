CREATE OR REPLACE FUNCTION public.fn_borrar_gasto_recurrente(p_recurrente_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id   bigint;
    v_pendientes integer;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}';
    END IF;

    -- El conteo se toma ANTES del DELETE: después, la cascada ya se los llevó.
    SELECT count(*) INTO v_pendientes
      FROM public.p_caja_cuarentena
     WHERE recurrente_id = p_recurrente_id
       AND origen = 'recurrente'
       AND estado = 'pendiente';

    DELETE FROM public.p_gastos_recurrentes
     WHERE recurrente_id = p_recurrente_id
       AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_recurrent_not_found", "params": {}}';
    END IF;

    RETURN v_pendientes;
END;
$function$
