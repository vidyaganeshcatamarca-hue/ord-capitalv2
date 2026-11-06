CREATE OR REPLACE FUNCTION public.fn_obtener_saldo_pasivo_tarjetas()
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id bigint;
    v_total_pasivo numeric;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    
    SELECT COALESCE(SUM(cd.monto_cuota), 0)
    INTO v_total_pasivo
    FROM p_cuotas_detalle cd
    INNER JOIN p_tarjetas_credito t ON cd.tarjeta_id = t.tarjeta_id
    WHERE t.user_id = v_user_id AND cd.pagado = false;
    
    RETURN v_total_pasivo;
END; $function$