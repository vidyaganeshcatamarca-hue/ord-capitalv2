CREATE OR REPLACE FUNCTION public.fn_obtener_techo_presupuestario()
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_user_id bigint;
    v_techo numeric := 0;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    SELECT COALESCE(SUM(valor_income), 0) / 3 INTO v_techo
    FROM (
        SELECT SUM(valor_ingreso) as valor_income 
        FROM p_caja 
        WHERE user_id = v_user_id AND tipo = 'income' AND fecha >= CURRENT_DATE - INTERVAL '90 days'
    ) as sub;
    
    IF v_techo = 0 THEN 
        SELECT COALESCE(SUM(valor_ingreso), 0) INTO v_techo FROM p_caja WHERE user_id = v_user_id AND tipo = 'income';
    END IF;

    RETURN ROUND(v_techo, 2);
END; $function$
