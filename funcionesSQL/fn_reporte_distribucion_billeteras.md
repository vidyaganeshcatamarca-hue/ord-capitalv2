CREATE OR REPLACE FUNCTION public.fn_reporte_distribucion_billeteras()
 RETURNS TABLE(nombre_billetera text, moneda text, saldo_actual numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT b.nombre::text, b.moneda::text, b.saldo_actual::numeric
    FROM p_billeteras b WHERE b.user_id = v_user_id AND b.activa = true ORDER BY b.moneda ASC, b.saldo_actual DESC;
END; $function$