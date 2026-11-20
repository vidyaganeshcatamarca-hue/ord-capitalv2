CREATE OR REPLACE FUNCTION public.fn_grupo_de_estructura(p_estructura bigint)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(e.padre_id, e.estructura_id)
      FROM public.p_estructuras_egresos e
     WHERE e.estructura_id = p_estructura;
$function$
