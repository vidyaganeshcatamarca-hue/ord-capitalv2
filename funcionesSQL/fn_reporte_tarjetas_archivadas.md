CREATE OR REPLACE FUNCTION public.fn_reporte_tarjetas_archivadas()
 RETURNS TABLE(
    tarjeta_id bigint, 
    nombre_tarjeta text, 
    limite_un_pago_total numeric, 
    limite_cuotas_total numeric, 
    dia_cierre integer,
    dia_vencimiento integer,
    banco text,
    color text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 AS $function$
 DECLARE
     v_user_id bigint;
 BEGIN
     SELECT user_id INTO v_user_id FROM public.usuarios WHERE auth_id = auth.uid();
     IF v_user_id IS NULL THEN RAISE EXCEPTION '{"key": "error_unauthorized", "params": {}}'; END IF;

     RETURN QUERY
     SELECT t.tarjeta_id, t.nombre_tarjeta, t.limite_un_pago, t.limite_cuotas, t.dia_cierre, t.dia_vencimiento, t.banco, t.color
     FROM p_tarjetas_credito t 
     WHERE t.user_id = v_user_id AND t.activa = false;
 END; 
 $function$;
