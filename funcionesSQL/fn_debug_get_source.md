CREATE OR REPLACE FUNCTION public.fn_debug_get_source(p_function_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_source text;
BEGIN
    SELECT prosrc INTO v_source FROM pg_proc WHERE proname = p_function_name LIMIT 1;
    RETURN v_source;
END;
$function$