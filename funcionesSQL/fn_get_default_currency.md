CREATE OR REPLACE FUNCTION public.fn_get_default_currency(p_user_id bigint)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Moneda local del pais confirmado, o NULL si todavia no eligio. NUNCA inventa una moneda.
  SELECT r.moneda_default::text
  FROM public.p_config_region r
  WHERE r.user_id = p_user_id;
$function$

-- NOTA: Cambio de comportamiento: devuelve NULL si el usuario todavia no eligio pais. Antes devolvia ARS.
