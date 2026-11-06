CREATE OR REPLACE FUNCTION public.fn_obtener_cotizacion_usd()
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 DECLARE
     v_user_id bigint;
     v_moneda text;
     v_cotizacion numeric;
 BEGIN
     SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();

     -- Moneda default del usuario
     SELECT moneda_default INTO v_moneda
     FROM p_config_region
     WHERE user_id = v_user_id;

     v_moneda := COALESCE(v_moneda, 'ARS');

     SELECT valor_por_usd INTO v_cotizacion
     FROM p_divisas
     WHERE nombre = v_moneda
     ORDER BY ultima_actualizacion DESC
     LIMIT 1;

     RETURN v_cotizacion;
 END;
$function$

