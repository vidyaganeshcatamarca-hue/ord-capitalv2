CREATE OR REPLACE FUNCTION public.fn_editar_tarjeta_credito(p_tarjeta_id bigint, p_nombre_tarjeta text DEFAULT NULL::text, p_banco text DEFAULT NULL::text, p_dia_vencimiento integer DEFAULT NULL::integer, p_dia_cierre integer DEFAULT NULL::integer, p_color text DEFAULT NULL::text, p_limite_un_pago numeric DEFAULT NULL::numeric, p_limite_cuotas numeric DEFAULT NULL::numeric, p_recargo_dolar_pct numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE p_tarjetas_credito SET 
        nombre_tarjeta = COALESCE(p_nombre_tarjeta, nombre_tarjeta),
        banco = CASE WHEN p_banco IS NULL THEN banco ELSE NULLIF(p_banco, '') END, -- F-10
        dia_vencimiento = COALESCE(p_dia_vencimiento, dia_vencimiento),
        dia_cierre = COALESCE(p_dia_cierre, dia_cierre),
        color = COALESCE(p_color, color),
        limite_un_pago = COALESCE(p_limite_un_pago, limite_un_pago),
        limite_cuotas = COALESCE(p_limite_cuotas, limite_cuotas)
    WHERE tarjeta_id = p_tarjeta_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_card_not_found", "params": {}}';
    END IF;
END;
$function$
