CREATE OR REPLACE FUNCTION public.fn_inicio_ciclo(p_user_id bigint, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT w.inicio FROM public.fn_ventana_ciclo_presupuesto(p_user_id, p_fecha) w; $function$
