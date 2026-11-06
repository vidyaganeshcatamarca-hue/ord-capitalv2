CREATE OR REPLACE FUNCTION public.fn_crear_tarjeta_credito(p_nombre_tarjeta text, p_banco text, p_dia_vencimiento integer, p_dia_cierre integer, p_limite_un_pago numeric, p_limite_cuotas numeric, p_color text DEFAULT '#6366F1'::text, p_recargo_dolar_pct numeric DEFAULT 30.00)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_user_id bigint;
    v_tarjeta_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    INSERT INTO p_tarjetas_credito (user_id, nombre_tarjeta, banco, dia_vencimiento, dia_cierre, color, limite_un_pago, limite_cuotas, moneda_iso)
    VALUES (v_user_id, p_nombre_tarjeta, p_banco, p_dia_vencimiento, p_dia_cierre, p_color, p_limite_un_pago, p_limite_cuotas, 0, COALESCE((SELECT moneda_default FROM public.p_config_region WHERE user_id = v_user_id), 'ARS'))
    RETURNING tarjeta_id INTO v_tarjeta_id;

    RETURN v_tarjeta_id;
END;
$function$
