CREATE OR REPLACE FUNCTION public.fn_editar_fondo_prevision(p_billetera_id bigint, p_nombre text DEFAULT NULL::text, p_monto_meta numeric DEFAULT NULL::numeric, p_fecha_objetivo date DEFAULT NULL::date, p_icono text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    UPDATE p_billeteras
    SET 
        nombre = COALESCE(p_nombre, nombre),
        monto_meta = COALESCE(p_monto_meta, monto_meta),
        fecha_objetivo = COALESCE(p_fecha_objetivo, fecha_objetivo),
        icono = COALESCE(p_icono, icono)
    WHERE billetera_id = p_billetera_id 
      AND user_id = v_user_id 
      AND es_fondo_prevision = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION '{"key": "error_savings_fund_not_found", "params": {}}';
    END IF;
END;
$function$