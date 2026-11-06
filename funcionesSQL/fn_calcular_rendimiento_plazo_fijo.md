CREATE OR REPLACE FUNCTION public.fn_calcular_rendimiento_plazo_fijo(p_inversion_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE 
    v_rendimiento numeric;
    v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

    SELECT (i.monto_invertido_original * (i.tasa_anual_tna / 100) * (CURRENT_DATE - i.fecha_inicio) / 365)
    INTO v_rendimiento
    FROM public.p_inversiones i
    WHERE i.inversion_id = p_inversion_id AND i.user_id = v_user_id;
    
    RETURN COALESCE(v_rendimiento, 0);
END; $function$