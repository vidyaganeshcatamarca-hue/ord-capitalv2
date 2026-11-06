CREATE OR REPLACE FUNCTION public.fn_crear_fondo_prevision(p_nombre text, p_monto_meta numeric, p_fecha_objetivo date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id BIGINT;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    INSERT INTO public.p_billeteras (
        nombre, moneda, saldo_actual, user_id, es_fondo_prevision, monto_meta, fecha_objetivo
    )
    VALUES (
        p_nombre, 'ARS', 0, v_user_id, TRUE, p_monto_meta, p_fecha_objetivo
    );
END; $function$