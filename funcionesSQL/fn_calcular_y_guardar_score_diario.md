CREATE OR REPLACE FUNCTION public.fn_calcular_y_guardar_score_diario()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    r_user RECORD;
    v_scores jsonb;
BEGIN
    -- Recorrer todos los usuarios activos
    FOR r_user IN SELECT user_id FROM public.usuarios WHERE activo = true LOOP
        -- En un entorno real, aquí se llamaría a la lógica de cálculo 
        -- pasando el user_id por contexto. Por simplicidad en este bloque,
        -- asumimos que existe una función interna que calcula y hace el INSERT.
        -- (Se implementará en la fase de Edge Functions / Infraestructura)
        NULL; 
    END LOOP;
END;
$function$