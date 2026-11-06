CREATE OR REPLACE FUNCTION public.fn_debug_triggers()
 RETURNS TABLE(trg_name text, trg_event text, trg_action text, trg_timing text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        trigger_name::text, 
        event_manipulation::text, 
        action_statement::text, 
        action_timing::text
    FROM information_schema.triggers 
    WHERE event_object_table = 'p_caja';
END;
$function$