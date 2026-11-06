CREATE OR REPLACE FUNCTION public.fn_obtener_config_presupuesto()
 RETURNS TABLE(
   modo_presupuesto text,
   porcentaje_necesidades numeric,
   porcentaje_deseos numeric,
   porcentaje_ahorro numeric,
   porcentaje_diezmo numeric,
   dia_ancla_ciclo smallint
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id bigint;
BEGIN
    SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

    RETURN QUERY
    SELECT 
        COALESCE(c.modo_presupuesto, 'anticipado')::text,
        COALESCE(c.porcentaje_necesidades, 50)::numeric,
        COALESCE(c.porcentaje_deseos, 30)::numeric,
        COALESCE(c.porcentaje_ahorro, 20)::numeric,
        COALESCE(c.porcentaje_diezmo, 0)::numeric,
        COALESCE(c.dia_ancla_ciclo, 1)::smallint
    FROM p_presupuestos_config c
    WHERE c.user_id = v_user_id;
END;
$function$
