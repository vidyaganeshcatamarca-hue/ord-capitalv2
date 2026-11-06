CREATE OR REPLACE FUNCTION public.fn_reporte_historial_abonos_pareja()
 RETURNS TABLE(pago_id bigint, fecha timestamp with time zone, de_usuario text, para_usuario text, monto numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_hogar_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;
    
    SELECT hogar_id INTO v_hogar_id FROM p_hogar_participantes WHERE user_id = v_user_id;
    IF v_hogar_id IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT 
        hp.pago_id,
        hp.creado_at,
        u1.nombre,
        u2.nombre,
        hp.monto
    FROM p_hogar_pagos hp
    INNER JOIN usuarios u1 ON hp.de_user_id = u1.user_id
    INNER JOIN usuarios u2 ON hp.para_user_id = u2.user_id
    WHERE hp.hogar_id = v_hogar_id
    ORDER BY hp.creado_at DESC
    LIMIT 50;
END;
$function$